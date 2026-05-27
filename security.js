// ============================================================
//  華夏風雲錄 — security.js
//  防火牆 · 安全驗證模塊 · 系統日誌 · 監控郵件
//  Copyright © 2026 linus622wang@gmail.com  All Rights Reserved.
// ============================================================
(function () {
    'use strict';

    // ── 常數 ─────────────────────────────────────────────────
    const _FB      = 'https://chroniclesofchinesehistory1-default-rtdb.asia-southeast1.firebasedatabase.app';
    const _EJ_SVC  = 'service_ATW5856LINUS';
    const _EJ_TMPL = 'template_ATW5856LINUS';
    const _EJ_KEY  = '6pXEpXo8kr54GfzH0';

    const LEVEL = Object.freeze({ INFO: 'info', WARN: 'warn', CRITICAL: 'critical' });

    // 速率限制設定
    const RATE_CFG = {
        login:    { max: 5,   ms: 5  * 60 * 1000, label: '登入'     },
        register: { max: 3,   ms: 60 * 60 * 1000, label: '註冊'     },
        fb_write: { max: 80,  ms: 60 * 1000,       label: '資料寫入' },
        fb_read:  { max: 300, ms: 60 * 1000,       label: '資料讀取' },
        chat:     { max: 12,  ms: 30 * 1000,       label: '聊天訊息' },
    };

    // 防火牆規則清單（展示用）
    const FW_RULES = [
        { label: 'XSS 跨站腳本防護',      desc: '過濾 <script>、onclick=、eval() 等危險注入'       },
        { label: 'SQL 注入防護',           desc: '攔截 UNION SELECT、DROP TABLE 等惡意資料庫指令'    },
        { label: '路徑穿越防護',           desc: '阻擋 ../ 相對路徑跳出根目錄的嘗試'                 },
        { label: '協議注入防護',           desc: '攔截 javascript:、data:、vbscript: 協議注入'       },
        { label: '暴力破解防護',           desc: '5 分鐘內登入失敗 5 次，帳號鎖定 5 分鐘'            },
        { label: '速率限制（Rate Limit）', desc: '各操作每時間窗口有上限，防止 DoS / 洪水攻擊'       },
        { label: '核心資料完整性驗證',     desc: '寫入前驗證銀兩、勝場等關鍵數值是否合理'            },
        { label: '監控郵件告警',           desc: '危急事件自動寄信通報管理員 linus622wang@gmail.com' },
    ];

    // ── 狀態 ─────────────────────────────────────────────────
    let _initialized  = false;
    let _status       = 'green'; // 'green' | 'yellow' | 'red'
    let _threatScore  = 0;
    let _localLogs    = [];      // 最近 200 條本地快取
    let _statusCbs    = [];
    let _currentTab   = 'log';
    let _currentFilter = 'all';
    const _failedLogins = {};    // { uname: { count, firstAt, blockUntil } }

    // ── Firebase 輕量 helpers ─────────────────────────────────
    async function _fbPatch(path, data) {
        try {
            await fetch(_FB + path + '.json', {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(data)
            });
        } catch {}
    }
    async function _fbGet(path) {
        try { const r = await fetch(_FB + path + '.json'); return r.ok ? r.json() : null; }
        catch { return null; }
    }

    // ── EmailJS 告警發信 ─────────────────────────────────────
    function _sendEmail(subject, body) {
        if (typeof emailjs === 'undefined') return;
        emailjs.send(_EJ_SVC, _EJ_TMPL, {
            action:     `🛡 [安全警報] ${subject}\n\n${body}`,
            event_time: new Date().toLocaleString('zh-TW'),
            user_agent: navigator.userAgent.slice(0, 120)
        }, _EJ_KEY).catch(() => {});
    }

    // ── 日誌記錄 ─────────────────────────────────────────────
    function _log(level, category, detail, alertEmail) {
        const entry = {
            t:   Date.now(),
            lv:  level,
            cat: category,
            msg: detail,
            ua:  navigator.userAgent.slice(0, 60)
        };

        // 本地快取
        _localLogs.unshift(entry);
        if (_localLogs.length > 200) _localLogs.splice(200);

        // Firebase 非同步寫入（靜默）
        const dk = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        _fbPatch(`/sys_logs/${dk}/${id}`, entry);

        // Console
        const icon = { info: 'ℹ️', warn: '⚠️', critical: '🚨' }[level] || '';
        console.log(`[🛡 HuaXia FW] ${icon} [${category}] ${detail}`);

        if (alertEmail) {
            _sendEmail(category, `${detail}\n\n等級：${level}\n時間：${new Date().toLocaleString('zh-TW')}`);
        }

        // 若儀表板開著，即時刷新日誌列表
        const dash = document.getElementById('security-dashboard');
        if (dash && !dash.classList.contains('hidden')) {
            _renderLogList();
            const cnt = document.getElementById('dash-log-count');
            if (cnt) cnt.textContent = _localLogs.length;
        }
    }

    function recordEvent(level, category, detail) {
        _log(level, category, detail, level === LEVEL.CRITICAL);
    }

    // ── 威脅分數 ─────────────────────────────────────────────
    function _addThreat(n) {
        _threatScore = Math.min(100, _threatScore + n);
        _refreshStatus();
    }

    function _refreshStatus() {
        const prev = _status;
        _status = _threatScore >= 50 ? 'red' : _threatScore >= 20 ? 'yellow' : 'green';
        if (_status !== prev) {
            _statusCbs.forEach(cb => { try { cb(_status, _threatScore); } catch {} });
            _updateLight();
            if (_status === 'red') {
                _sendEmail('🔴 防火牆威脅等級升至紅色', `當前威脅分數：${_threatScore}/100`);
            }
        }
    }

    // 每 60 秒自然衰減 5 點
    setInterval(() => {
        if (_threatScore > 0) { _threatScore = Math.max(0, _threatScore - 5); _refreshStatus(); }
    }, 60000);

    // ── 速率限制 ─────────────────────────────────────────────
    function checkRate(type) {
        const cfg = RATE_CFG[type];
        if (!cfg) return { allowed: true, remaining: 999 };

        const key = `fw_rl_${type}`, now = Date.now();
        let d;
        try { d = JSON.parse(localStorage.getItem(key) || 'null'); } catch { d = null; }
        if (!d || now - d.w > cfg.ms) d = { count: 0, w: now };
        d.count++;
        try { localStorage.setItem(key, JSON.stringify(d)); } catch {}

        const allowed = d.count <= cfg.max;
        if (!allowed) {
            _log(LEVEL.WARN, 'rate_limit', `${cfg.label} 速率限制觸發（${d.count}/${cfg.max}）`);
            _addThreat(10);
        }
        return { allowed, remaining: Math.max(0, cfg.max - d.count), count: d.count, max: cfg.max };
    }

    // ── 輸入安全驗證 ─────────────────────────────────────────
    const _PATS = [
        { n: 'XSS',   re: /<script|javascript:|on\w+\s*=|<iframe|eval\s*\(|document\.\w/i },
        { n: 'SQL',   re: /\bUNION\b.*\bSELECT\b|\bDROP\b\s+\bTABLE\b/i                  },
        { n: 'PATH',  re: /\.\.[/\\]/                                                       },
        { n: 'PROTO', re: /^(javascript|data|vbscript):/i                                  },
    ];

    function validateInput(type, value) {
        if (typeof value !== 'string') value = String(value ?? '');

        for (const { n, re } of _PATS) {
            if (re.test(value)) {
                _log(LEVEL.CRITICAL, 'inject', `${type} 欄位偵測到 ${n} 攻擊嘗試`, true);
                _addThreat(35);
                return { valid: false, threat: n, msg: '偵測到非法輸入，已記錄並通報管理員' };
            }
        }

        switch (type) {
            case 'username': if (!/^[a-z0-9_]{3,20}$/.test(value))      return { valid: false, msg: '帳號格式不符' };              break;
            case 'email':    if (!value.includes('@') || value.length > 250) return { valid: false, msg: '信箱格式不符' };           break;
            case 'password': if (value.length < 6 || value.length > 128) return { valid: false, msg: '密碼長度需 6~128 字元' };     break;
            case 'chat':     if (value.length > 300)                     return { valid: false, msg: '訊息過長（最多 300 字）' };   break;
            case 'roomCode': if (!/^\d{5}$/.test(value))                 return { valid: false, msg: '代碼需為 5 位純數字' };       break;
            case 'silver': {
                const n = Number(value);
                if (!Number.isInteger(n) || n < 0 || n > 999999) {
                    _log(LEVEL.CRITICAL, 'data_tamper', `可疑 silver 值：${value}`, true);
                    _addThreat(40);
                    return { valid: false, msg: '數值異常，已通報' };
                }
                break;
            }
        }
        return { valid: true };
    }

    // ── 底層核心資料完整性驗證 ───────────────────────────────
    function validateCoreData(type, data) {
        try {
            if (type === 'user_stats') {
                if (data.wins   !== undefined && (data.wins   < 0 || data.wins   > 99999)) return false;
                if (data.losses !== undefined && (data.losses < 0 || data.losses > 99999)) return false;
                if (data.silver !== undefined && (data.silver < 0 || data.silver > 999999)) {
                    _log(LEVEL.CRITICAL, 'data_tamper', `異常 silver 寫入嘗試：${data.silver}`, true);
                    _addThreat(50);
                    return false;
                }
            }
            if (type === 'chat_msg') {
                if (typeof data.text !== 'string' || data.text.length > 300) return false;
            }
        } catch {}
        return true;
    }

    // ── 暴力破解防護 ─────────────────────────────────────────
    function recordFailedLogin(username) {
        const now = Date.now();
        if (!_failedLogins[username]) _failedLogins[username] = { count: 0, firstAt: now };
        const d = _failedLogins[username];
        if (now - d.firstAt > 5 * 60 * 1000) { d.count = 0; d.firstAt = now; delete d.blockUntil; }

        d.count++;
        _log(LEVEL.WARN, 'login_fail', `帳號 ${username} 登入失敗（第 ${d.count} 次）`);
        _addThreat(5);

        if (d.count >= 5) {
            d.blockUntil = now + 5 * 60 * 1000;
            _log(LEVEL.CRITICAL, 'brute_force', `帳號 ${username} 觸發暴力破解防護（共 ${d.count} 次失敗）`, true);
            _addThreat(20);
            return { blocked: true, waitSec: 300, count: d.count };
        }
        return { blocked: false, count: d.count, remaining: 5 - d.count };
    }

    function isLoginBlocked(username) {
        const d = _failedLogins[username];
        if (!d || !d.blockUntil) return false;
        if (Date.now() > d.blockUntil) { delete d.blockUntil; d.count = 0; return false; }
        return true;
    }

    function getBlockRemaining(username) {
        const d = _failedLogins[username];
        if (!d || !d.blockUntil) return 0;
        return Math.ceil((d.blockUntil - Date.now()) / 1000);
    }

    function recordSuccessLogin(username) {
        delete _failedLogins[username];
        _log(LEVEL.INFO, 'login_ok', `帳號 ${username} 登入成功`);
    }

    // ── 狀態查詢 ─────────────────────────────────────────────
    function onStatusChange(cb) { _statusCbs.push(cb); }
    function getStatus()        { return _status; }
    function getThreatScore()   { return _threatScore; }
    function getLocalLogs(n)    { return _localLogs.slice(0, n || 100); }

    async function getRemoteLogs(days) {
        days = days || 3;
        const all = [];
        for (let i = 0; i < days; i++) {
            const dk = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
            const data = await _fbGet(`/sys_logs/${dk}`);
            if (data) Object.values(data).forEach(e => all.push(e));
        }
        return all.sort((a, b) => b.t - a.t);
    }

    // ════════════════════════════════════════════════════════
    //  UI：防火牆指示燈
    // ════════════════════════════════════════════════════════
    function _updateLight() {
        const light = document.getElementById('fw-status-light');
        const label = document.getElementById('fw-status-label');
        const pill  = document.getElementById('fw-indicator');
        if (!light) return;

        const C = {
            green : { c: '#00ff88', g: 'rgba(0,255,136,0.55)',  t: '安全', bg: 'rgba(0,255,136,0.07)',  b: 'rgba(0,255,136,0.22)' },
            yellow: { c: '#ffcc00', g: 'rgba(255,204,0,0.55)',  t: '警戒', bg: 'rgba(255,204,0,0.07)',  b: 'rgba(255,204,0,0.22)' },
            red   : { c: '#ff4444', g: 'rgba(255,68,68,0.65)',  t: '危險', bg: 'rgba(255,68,68,0.09)',  b: 'rgba(255,68,68,0.30)' },
        }[_status];

        light.style.background = C.c;
        light.style.boxShadow  = `0 0 6px ${C.g}, 0 0 12px ${C.g}`;
        if (label) { label.textContent = C.t; label.style.color = C.c; }
        if (pill)  { pill.style.background = C.bg; pill.style.borderColor = C.b; }
    }

    // ════════════════════════════════════════════════════════
    //  UI：安全儀表板渲染
    // ════════════════════════════════════════════════════════
    function _renderDashboard() {
        // 狀態 cards
        const dLight  = document.getElementById('dash-light');
        const dStatus = document.getElementById('dash-status-text');
        const dThreat = document.getElementById('dash-threat');
        const dCnt    = document.getElementById('dash-log-count');

        if (dLight && dStatus) {
            const C = { green: '#00ff88', yellow: '#ffcc00', red: '#ff4444' }[_status];
            const T = { green: '安全',    yellow: '警戒',    red: '危險'    }[_status];
            dLight.style.background = C;
            dLight.style.boxShadow  = `0 0 8px ${C}aa`;
            dStatus.textContent     = T;
            dStatus.style.color     = C;
        }
        if (dThreat) {
            const C = _threatScore >= 50 ? '#ff4444' : _threatScore >= 20 ? '#ffcc00' : '#00ff88';
            dThreat.innerHTML = `<span style="color:${C}">${_threatScore}</span><span style="font-size:10px;color:#2a5a3a;">/100</span>`;
        }
        if (dCnt) dCnt.textContent = _localLogs.length;

        // 速率限制格
        const rlEl = document.getElementById('dash-rate-limits');
        if (rlEl) {
            rlEl.innerHTML = Object.entries(RATE_CFG).map(([type, cfg]) => {
                const key = `fw_rl_${type}`, now = Date.now();
                let d; try { d = JSON.parse(localStorage.getItem(key) || 'null'); } catch { d = null; }
                const count = (d && now - d.w < cfg.ms) ? d.count : 0;
                const pct   = Math.min(100, Math.round(count / cfg.max * 100));
                const C     = pct >= 90 ? '#ff4444' : pct >= 60 ? '#ffcc00' : '#00ff88';
                return `<div style="background:#041208;border:1px solid #0d2015;border-radius:6px;padding:6px 8px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                        <span style="color:#4a7a5a;font-size:10px;">${cfg.label}</span>
                        <span style="color:${C};font-size:10px;font-weight:700;">${count}/${cfg.max}</span>
                    </div>
                    <div style="height:3px;background:#0a1a0e;border-radius:2px;overflow:hidden;">
                        <div style="height:100%;width:${pct}%;background:${C};border-radius:2px;transition:width .4s;"></div>
                    </div>
                </div>`;
            }).join('');
        }

        _renderLogList();
    }

    function _renderLogList() {
        const el = document.getElementById('dash-log-list');
        if (!el) return;

        const list = _currentFilter === 'all'
            ? _localLogs
            : _localLogs.filter(e => e.lv === _currentFilter);

        if (list.length === 0) {
            el.innerHTML = `<div style="color:#2a5a3a;text-align:center;padding:28px 0;font-size:12px;">── 暫無記錄 ──</div>`;
            return;
        }

        const BG  = { info: 'rgba(0,255,136,0.03)',  warn: 'rgba(255,204,0,0.04)',  critical: 'rgba(255,68,68,0.06)' };
        const BD  = { info: 'rgba(0,255,136,0.09)',  warn: 'rgba(255,204,0,0.12)',  critical: 'rgba(255,68,68,0.20)' };
        const COL = { info: '#3a7a5a',               warn: '#8a7830',               critical: '#8a3030'              };
        const IC  = { info: 'ℹ️',                    warn: '⚠️',                    critical: '🚨'                   };

        el.innerHTML = list.slice(0, 120).map(e => {
            const d   = new Date(e.t);
            const ts  = d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const dt  = d.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
            return `<div style="background:${BG[e.lv]};border:1px solid ${BD[e.lv]};border-radius:6px;padding:7px 10px;font-size:11px;line-height:1.4;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
                    <span style="color:${COL[e.lv]};font-weight:700;">${IC[e.lv]} ${e.cat}</span>
                    <span style="color:#1a4a2a;font-size:10px;">${dt} ${ts}</span>
                </div>
                <div style="color:#5a8a6a;">${e.msg}</div>
            </div>`;
        }).join('');
    }

    function _renderRulesPanel() {
        const el = document.getElementById('dash-panel-rules');
        if (!el) return;
        el.innerHTML = FW_RULES.map(r => `
            <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:#041208;border:1px solid #0d2015;border-radius:8px;margin-bottom:6px;">
                <div style="width:8px;height:8px;border-radius:50%;background:#00ff88;box-shadow:0 0 6px rgba(0,255,136,0.5);flex-shrink:0;margin-top:4px;"></div>
                <div style="flex:1;">
                    <div style="color:#5acc88;font-weight:700;font-size:12px;letter-spacing:0.5px;">${r.label}</div>
                    <div style="color:#3a6a4a;font-size:11px;margin-top:3px;line-height:1.4;">${r.desc}</div>
                </div>
                <div style="flex-shrink:0;font-size:10px;color:#00ff88;background:rgba(0,255,136,0.08);border:1px solid rgba(0,255,136,0.18);padding:2px 8px;border-radius:10px;white-space:nowrap;">✓ 啟用</div>
            </div>
        `).join('');
    }

    function _renderEmailPanel() {
        const el = document.getElementById('dash-panel-email');
        if (!el) return;
        const critLogs = _localLogs.filter(e => e.lv === 'critical');

        el.innerHTML = `
            <div style="background:#041208;border:1px solid #0d2015;border-radius:10px;padding:16px 18px;margin-bottom:12px;">
                <div style="font-size:10px;color:#1a4a28;letter-spacing:2px;margin-bottom:12px;">── 監控信箱設定 ──</div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #0d2015;">
                    <span style="color:#4a7a5a;font-size:12px;">🎯 告警收件人</span>
                    <span style="color:#00ff88;font-size:12px;font-weight:700;">linus622wang@gmail.com</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #0d2015;">
                    <span style="color:#4a7a5a;font-size:12px;">⚡ 觸發等級</span>
                    <span style="color:#ffcc00;font-size:12px;font-weight:700;">CRITICAL（危急）</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;margin-bottom:12px;">
                    <span style="color:#4a7a5a;font-size:12px;">🔴 本次危急事件</span>
                    <span style="color:${critLogs.length > 0 ? '#ff4444' : '#00ff88'};font-size:12px;font-weight:700;">${critLogs.length} 件</span>
                </div>
                <button id="btn-test-alert" onclick="window._sendTestAlert()" style="width:100%;background:linear-gradient(135deg,#041a0a,#071a0a);border:1px solid rgba(0,255,136,0.18);color:#00ff88;padding:10px;border-radius:8px;font-size:12px;font-family:inherit;cursor:pointer;letter-spacing:2px;transition:all .2s;" onmouseover="this.style.borderColor='rgba(0,255,136,0.45)';this.style.background='#072010'" onmouseout="this.style.borderColor='rgba(0,255,136,0.18)';this.style.background='linear-gradient(135deg,#041a0a,#071a0a)'">
                    📧 發送測試警報郵件
                </button>
            </div>
            <div style="font-size:10px;color:#1a4a28;letter-spacing:2px;margin-bottom:8px;">── 最近危急告警記錄 ──</div>
            ${critLogs.length === 0
                ? '<div style="color:#2a5a3a;text-align:center;padding:20px;font-size:11px;">── 目前無危急事件記錄 ──</div>'
                : critLogs.slice(0, 10).map(e => {
                    const ts = new Date(e.t).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                    return `<div style="background:rgba(255,68,68,0.05);border:1px solid rgba(255,68,68,0.14);border-radius:6px;padding:8px 10px;margin-bottom:5px;font-size:11px;">
                        <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
                            <span style="color:#8a3030;font-weight:700;">🚨 ${e.cat}</span>
                            <span style="color:#2a4a3a;">${ts}</span>
                        </div>
                        <div style="color:#5a5a5a;">${e.msg}</div>
                    </div>`;
                }).join('')
            }
        `;
    }

    // ── 頁籤切換 helper ──────────────────────────────────────
    function _setTabUI(active) {
        ['log', 'rules', 'email'].forEach(t => {
            const btn   = document.getElementById(`dash-tab-${t}`);
            const panel = document.getElementById(`dash-panel-${t}`);
            const isOn  = t === active;
            if (btn) {
                btn.style.background   = isOn ? 'rgba(0,255,136,0.11)' : 'none';
                btn.style.color        = isOn ? '#00ff88' : '#2a5a3a';
                btn.style.borderColor  = isOn ? 'rgba(0,255,136,0.32)' : '#0d2015';
            }
            if (panel) panel.classList[isOn ? 'remove' : 'add']('hidden');
        });
    }

    // ════════════════════════════════════════════════════════
    //  window 暴露：儀表板控制
    // ════════════════════════════════════════════════════════
    window._openSecurityDashboard = function () {
        const modal = document.getElementById('security-dashboard');
        if (!modal) return;
        modal.classList.remove('hidden');
        _currentTab    = 'log';
        _currentFilter = 'all';
        _renderDashboard();
        _renderRulesPanel();
        _renderEmailPanel();
        _setTabUI('log');
        // 同步 filter 按鈕視覺
        ['all', 'critical', 'warn', 'info'].forEach(l => {
            const btn = document.getElementById(`dash-filter-${l}`);
            if (btn) {
                const isOn = l === 'all';
                btn.style.background  = isOn ? 'rgba(0,255,136,0.14)' : 'none';
                btn.style.color       = isOn ? '#00ff88' : '#2a5a3a';
                btn.style.borderColor = isOn ? 'rgba(0,255,136,0.38)' : '#0d2015';
            }
        });
    };

    window._closeSecurityDashboard = function () {
        const modal = document.getElementById('security-dashboard');
        if (modal) modal.classList.add('hidden');
    };

    window._dashTab = function (tab) {
        _currentTab = tab;
        _setTabUI(tab);
        if (tab === 'rules') _renderRulesPanel();
        else if (tab === 'email') _renderEmailPanel();
        else _renderLogList();
    };

    window._dashLogFilter = function (level) {
        _currentFilter = level;
        ['all', 'critical', 'warn', 'info'].forEach(l => {
            const btn = document.getElementById(`dash-filter-${l}`);
            if (!btn) return;
            const isOn = l === level;
            btn.style.background  = isOn ? 'rgba(0,255,136,0.14)' : 'none';
            btn.style.color       = isOn ? '#00ff88' : '#2a5a3a';
            btn.style.borderColor = isOn ? 'rgba(0,255,136,0.38)' : '#0d2015';
        });
        _renderLogList();
    };

    window._dashRefreshLogs = async function () {
        const btn = document.getElementById('dash-refresh-btn');
        if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
        try {
            const remote = await getRemoteLogs(1);
            let added = 0;
            remote.forEach(e => {
                if (!_localLogs.some(l => l.t === e.t && l.msg === e.msg)) {
                    _localLogs.push(e);
                    added++;
                }
            });
            if (added) {
                _localLogs.sort((a, b) => b.t - a.t);
                if (_localLogs.length > 200) _localLogs.splice(200);
            }
            _renderDashboard();
        } finally {
            if (btn) { btn.textContent = '🔄 刷新'; btn.disabled = false; }
        }
    };

    window._sendTestAlert = function () {
        const btn = document.getElementById('btn-test-alert');
        if (btn) { btn.textContent = '⏳ 發送中…'; btn.disabled = true; }
        _sendEmail('📧 測試警報', '這是一封來自 華夏風雲錄 安全系統的測試郵件。\n防火牆運作正常，監控郵件功能已驗證。');
        _log(LEVEL.INFO, 'email_test', '管理員手動發送了測試警報郵件');
        setTimeout(() => {
            if (btn) { btn.textContent = '✅ 已發送'; setTimeout(() => { if (btn) { btn.textContent = '📧 發送測試警報郵件'; btn.disabled = false; } }, 2000); }
            _renderEmailPanel();
        }, 1000);
    };

    // ════════════════════════════════════════════════════════
    //  初始化
    // ════════════════════════════════════════════════════════
    function init() {
        if (_initialized) { _updateLight(); return; }
        _initialized = true;
        _log(LEVEL.INFO, 'system', '🛡 防火牆安全系統啟動 v20260527m');
        _updateLight();

        // 監聽潛在的 JS 注入錯誤
        window.addEventListener('error', e => {
            if (e.message && /script error|xss|injection/i.test(e.message)) {
                _log(LEVEL.WARN, 'js_error', e.message.slice(0, 100));
            }
        });
    }

    // ════════════════════════════════════════════════════════
    //  Public API
    // ════════════════════════════════════════════════════════
    window.HuaXiaSecurity = {
        LEVEL,
        init,
        recordEvent,
        checkRate,
        validateInput,
        validateCoreData,
        recordFailedLogin,
        recordSuccessLogin,
        isLoginBlocked,
        getBlockRemaining,
        getStatus,
        getThreatScore,
        onStatusChange,
        getLocalLogs,
        getRemoteLogs,
    };
})();
