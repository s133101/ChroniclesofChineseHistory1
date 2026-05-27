// ============================================================
//  華夏風雲錄 — security.js  v20260527n
//  多層防火牆 · 安全監控中心 · 系統日誌 · 入侵預警
//  Copyright © 2026 linus622wang@gmail.com  All Rights Reserved.
// ============================================================
(function () {
    'use strict';

    // ════════════════════════════════════════════════════════
    //  § 0  常數配置
    // ════════════════════════════════════════════════════════
    const _FB      = 'https://chroniclesofchinesehistory1-default-rtdb.asia-southeast1.firebasedatabase.app';
    const _EJ_SVC  = 'service_ATW5856LINUS';
    const _EJ_TMPL = 'template_ATW5856LINUS';
    const _EJ_KEY  = '6pXEpXo8kr54GfzH0';

    const LEVEL = Object.freeze({ INFO: 'info', WARN: 'warn', CRITICAL: 'critical' });
    const CAT   = Object.freeze({
        SYSTEM   : 'system',
        INTRUSION: 'intrusion',
        DB_ACCESS: 'db_access',
        ERROR    : 'error',
        OPS      : 'ops',
        SCAN     : 'scan',
        L1       : 'fw_l1',
        L2       : 'fw_l2',
        L3       : 'fw_l3',
        L4       : 'fw_l4',
        L5       : 'fw_l5',
    });

    // 速率限制配置
    const RATE_CFG = {
        login   : { max: 5,   ms: 5  * 60000, label: '登入'     },
        register: { max: 3,   ms: 60 * 60000, label: '註冊'     },
        fb_write: { max: 80,  ms: 60000,       label: '資料寫入' },
        fb_read : { max: 300, ms: 60000,       label: '資料讀取' },
        chat    : { max: 12,  ms: 30000,       label: '聊天訊息' },
    };

    // 多層防火牆定義
    const FW_LAYERS = [
        { id: 'L1', label: 'L1 輸入驗證',   desc: 'XSS / SQL 注入 / 路徑穿越 / 協議注入' },
        { id: 'L2', label: 'L2 速率限制',   desc: '各操作頻率上限，防止洪水 / DoS 攻擊' },
        { id: 'L3', label: 'L3 行為分析',   desc: '偵測機器人行為 / 異常請求模式'         },
        { id: 'L4', label: 'L4 資料完整性', desc: '核心數值寫入前合法性驗證'              },
        { id: 'L5', label: 'L5 會話驗證',   desc: '會話完整性 / 劫持偵測'                 },
    ];

    // 模塊清單（掃描用）
    const MODULE_CHECKS = [
        { id: 'fw_l1',  label: 'L1 輸入驗證',   fn: () => typeof window.HuaXiaSecurity?.validateInput === 'function'     },
        { id: 'fw_l2',  label: 'L2 速率限制',   fn: () => typeof window.HuaXiaSecurity?.checkRate     === 'function'     },
        { id: 'fw_l3',  label: 'L3 行為分析',   fn: () => _behaviorOk()                                                  },
        { id: 'fw_l4',  label: 'L4 資料完整性', fn: () => typeof window.HuaXiaSecurity?.validateCoreData === 'function'  },
        { id: 'fw_l5',  label: 'L5 會話驗證',   fn: () => _sessionOk()                                                   },
        { id: 'auth',   label: 'Auth 驗證模塊',  fn: () => typeof window.Auth !== 'undefined'                             },
        { id: 'db',     label: 'Firebase 連線',  fn: () => _fbReachable                                                   },
        { id: 'dom',    label: '核心 DOM 元素',  fn: () => !!document.getElementById('lobby-screen')                     },
        { id: 'email',  label: '監控郵件模塊',   fn: () => typeof emailjs !== 'undefined'                                 },
        { id: 'l1func', label: 'L1 功能驗證',   fn: () => { try { return window.HuaXiaSecurity.validateInput('chat','<script>x</script>').valid === false; } catch { return false; } } },
    ];

    // L1 攻擊模式
    const _ATTACK_PATS = [
        { n: 'XSS',   re: /<script|javascript:|on\w+\s*=|<iframe|<svg.*on|eval\s*\(|document\.\w/i },
        { n: 'SQL',   re: /\bUNION\b.*\bSELECT\b|\bDROP\b\s+\bTABLE\b|\bINSERT\b\s+\bINTO\b/i      },
        { n: 'PATH',  re: /\.\.[/\\]/                                                                 },
        { n: 'PROTO', re: /^(javascript|data|vbscript):/i                                             },
        { n: 'CMD',   re: /[;&|`$]|\bexec\b|\bsystem\b|\bpasswd\b/i                                  },
    ];

    // ════════════════════════════════════════════════════════
    //  § 1  狀態
    // ════════════════════════════════════════════════════════
    let _initialized  = false;
    let _status       = 'green';   // 'green' | 'yellow' | 'red'
    let _threatScore  = 0;
    let _clientIp     = null;      // 緩存 IP
    let _fbReachable  = true;      // Firebase 連線狀態
    let _intrusionCnt = 0;         // 入侵事件計數
    let _statusCbs    = [];
    let _monTab       = 'security'; // 當前頁籤
    let _logFilter    = 'all';

    // 各類別日誌（本地快取）
    const _logs = {
        security : [],   // 安全日誌（通用）
        intrusion: [],   // 入侵日誌
        db_access: [],   // 資料庫訪問日誌
        error    : [],   // 系統錯誤日誌
        ops      : [],   // 操作日誌
        scan     : [],   // 掃描結果
    };

    // 防火牆各層狀態
    const _layerStatus = { L1:'ok', L2:'ok', L3:'ok', L4:'ok', L5:'ok' };

    // 暴力破解追蹤
    const _failedLogins  = {};  // { uname: { count, firstAt, blockUntil } }

    // L3 行為追蹤
    const _behaviorTrack = {};  // { key: [timestamps] }
    let   _l3Healthy     = true;

    // L5 會話指紋
    let _sessionFp = null;

    // 掃描結果快取
    let _lastScanResults = [];
    let _lastScanTime    = 0;

    // ════════════════════════════════════════════════════════
    //  § 2  工具 helpers
    // ════════════════════════════════════════════════════════
    function _ts() { return new Date().toLocaleString('zh-TW', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' }); }

    // 解析客戶端 IP（一次性，快取）
    async function _resolveIp() {
        if (_clientIp) return _clientIp;
        try {
            const r = await fetch('https://api64.ipify.org?format=json', { signal: AbortSignal.timeout(4000) });
            const d = await r.json();
            _clientIp = d.ip || '未知';
        } catch { _clientIp = '無法取得'; }
        return _clientIp;
    }

    // Firebase REST helpers
    async function _fbPatch(path, data) {
        try {
            await fetch(_FB + path + '.json', {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            _fbReachable = true;
        } catch { _fbReachable = false; }
    }
    async function _fbGet(path) {
        try {
            const r = await fetch(_FB + path + '.json', { signal: AbortSignal.timeout(5000) });
            _fbReachable = r.ok;
            return r.ok ? r.json() : null;
        } catch { _fbReachable = false; return null; }
    }

    // L3 行為追蹤健康狀態
    function _behaviorOk() { return _l3Healthy; }

    // L5 會話狀態
    function _sessionOk() {
        if (!_sessionFp) return true; // 未登入時不檢查
        const cur = sessionStorage.getItem('hua_session');
        if (!cur) return true;
        try {
            const s = JSON.parse(cur);
            return _sessionFp === s.username;
        } catch { return false; }
    }

    // ════════════════════════════════════════════════════════
    //  § 3  EmailJS 告警發信
    // ════════════════════════════════════════════════════════
    function _sendEmail(subject, body) {
        if (typeof emailjs === 'undefined') return;
        emailjs.send(_EJ_SVC, _EJ_TMPL, {
            action    : `🛡 [安全告警] ${subject}\n\n${body}`,
            event_time: _ts(),
            user_agent: `IP: ${_clientIp || '?'}\nUA: ${navigator.userAgent.slice(0, 100)}`
        }, _EJ_KEY).catch(() => {});
    }

    // ════════════════════════════════════════════════════════
    //  § 4  多類別日誌系統
    // ════════════════════════════════════════════════════════
    async function _log(level, category, detail, alertEmail) {
        const ip   = _clientIp || '?';
        const user = _currentUser();
        const entry = { t: Date.now(), lv: level, cat: category, msg: detail, ip, user, ua: navigator.userAgent.slice(0, 60) };

        // 分類本地快取
        const bucket = _logs[category] || _logs.security;
        bucket.unshift(entry);
        if (bucket.length > 200) bucket.splice(200);

        // 同步寫入 Firebase
        const dk = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        _fbPatch(`/sys_logs/${dk}/${id}`, entry);

        console.log(`[🛡 FW:${category}] [${level.toUpperCase()}] ${detail} | IP:${ip}`);

        if (alertEmail) {
            _sendEmail(`[${level}] ${category}: ${detail}`,
                `操作者：${user}\nIP：${ip}\n時間：${_ts()}\n詳情：${detail}`);
        }

        // 即時更新監控面板
        _updateMonitorLive(category, entry);
    }

    function _currentUser() {
        try {
            const s = JSON.parse(sessionStorage.getItem('hua_session') || 'null');
            return s?.username || '未登入';
        } catch { return '?'; }
    }

    // 公開 log API
    function recordEvent(level, category, detail) {
        _log(level, category || CAT.SECURITY, detail, level === LEVEL.CRITICAL);
    }

    function logDbAccess(op, path, user) {
        _log(LEVEL.INFO, CAT.DB_ACCESS, `${op} → ${path} ← ${user || _currentUser()}`);
    }

    function logOps(action, user) {
        _log(LEVEL.INFO, CAT.OPS, action, false);
    }

    function logError(msg, stack) {
        _log(LEVEL.WARN, CAT.ERROR, `${msg}${stack ? ' | ' + stack.slice(0, 80) : ''}`);
    }

    function logIntrusion(detail) {
        _intrusionCnt++;
        _log(LEVEL.CRITICAL, CAT.INTRUSION, detail, true);
        _triggerIntrusionAlert(detail);
        _addThreat(30);
    }

    // ════════════════════════════════════════════════════════
    //  § 5  威脅分數 & 狀態
    // ════════════════════════════════════════════════════════
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
        }
    }

    // 每 60s 衰減
    setInterval(() => {
        if (_threatScore > 0) { _threatScore = Math.max(0, _threatScore - 5); _refreshStatus(); }
    }, 60000);

    // ════════════════════════════════════════════════════════
    //  § 6  防火牆 L1 — 輸入驗證
    // ════════════════════════════════════════════════════════
    function validateInput(type, value) {
        if (typeof value !== 'string') value = String(value ?? '');

        for (const { n, re } of _ATTACK_PATS) {
            if (re.test(value)) {
                _layerStatus.L1 = 'error';
                const msg = `${type} 欄位偵測到 ${n} 攻擊（payload: ${value.slice(0, 40)}）`;
                logIntrusion(`L1 攔截 — ${msg}`);
                _log(LEVEL.CRITICAL, CAT.L1, msg, true);
                _addThreat(35);
                return { valid: false, threat: n, msg: '偵測到非法輸入，已記錄並通報管理員' };
            }
        }

        switch (type) {
            case 'username': if (!/^[a-z0-9_]{3,20}$/.test(value))       return { valid: false, msg: '帳號格式不符' };                break;
            case 'email':    if (!value.includes('@') || value.length > 250) return { valid: false, msg: '信箱格式不符' };              break;
            case 'password': if (value.length < 6 || value.length > 128)  return { valid: false, msg: '密碼長度需 6–128 字元' };       break;
            case 'chat':     if (value.length > 300)                      return { valid: false, msg: '訊息過長（最多 300 字）' };     break;
            case 'roomCode': if (!/^\d{5}$/.test(value))                  return { valid: false, msg: '代碼需為 5 位純數字' };         break;
            case 'silver': {
                const n = Number(value);
                if (!Number.isInteger(n) || n < 0 || n > 999999) {
                    logIntrusion(`L1 資料竄改嘗試 — silver 異常值：${value}`);
                    _addThreat(40);
                    return { valid: false, msg: '數值異常，已通報管理員' };
                }
                break;
            }
        }

        if (_layerStatus.L1 === 'error') _layerStatus.L1 = 'warn';
        return { valid: true };
    }

    // ════════════════════════════════════════════════════════
    //  § 7  防火牆 L2 — 速率限制
    // ════════════════════════════════════════════════════════
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
            _layerStatus.L2 = 'warn';
            _log(LEVEL.WARN, CAT.L2, `${cfg.label} 速率超限（${d.count}/${cfg.max}）`);
            _addThreat(10);
            if (d.count >= cfg.max * 2) {
                _layerStatus.L2 = 'error';
                logIntrusion(`L2 速率嚴重超限 — ${cfg.label}: ${d.count}/${cfg.max}`);
            }
        } else {
            if (_layerStatus.L2 === 'error') _layerStatus.L2 = 'warn';
        }

        return { allowed, remaining: Math.max(0, cfg.max - d.count), count: d.count, max: cfg.max };
    }

    // ════════════════════════════════════════════════════════
    //  § 8  防火牆 L3 — 行為分析
    // ════════════════════════════════════════════════════════
    function trackBehavior(action) {
        const now = Date.now();
        if (!_behaviorTrack[action]) _behaviorTrack[action] = [];
        const ts = _behaviorTrack[action];
        ts.push(now);

        // 只保留最近 60s 的時間戳
        const cutoff = now - 60000;
        while (ts.length && ts[0] < cutoff) ts.shift();

        // 異常：1 分鐘內同一操作 > 30 次
        if (ts.length > 30) {
            _layerStatus.L3 = 'warn';
            _log(LEVEL.WARN, CAT.L3, `行為異常：${action} 1 分鐘內出現 ${ts.length} 次`);
            _addThreat(8);
            _l3Healthy = false;
        }
        // 嚴重：1 分鐘 > 60 次（機器人攻擊）
        if (ts.length > 60) {
            _layerStatus.L3 = 'error';
            logIntrusion(`L3 偵測到機器人攻擊 — ${action}: ${ts.length} 次/分鐘`);
        }

        // 操作間隔過短（< 100ms 視為自動化）
        if (ts.length >= 3) {
            const last3 = ts.slice(-3);
            const avgInterval = (last3[2] - last3[0]) / 2;
            if (avgInterval < 100) {
                _log(LEVEL.WARN, CAT.L3, `L3 偵測到自動化行為 — ${action} 平均間隔 ${Math.round(avgInterval)}ms`);
                _addThreat(5);
                _l3Healthy = false;
            }
        }
    }

    // ════════════════════════════════════════════════════════
    //  § 9  防火牆 L4 — 資料完整性
    // ════════════════════════════════════════════════════════
    function validateCoreData(type, data) {
        try {
            if (type === 'user_stats') {
                if (data.wins   !== undefined && (data.wins   < 0 || data.wins   > 99999)) {
                    _layerStatus.L4 = 'error';
                    logIntrusion(`L4 統計資料異常 — wins: ${data.wins}`);
                    return false;
                }
                if (data.losses !== undefined && (data.losses < 0 || data.losses > 99999)) {
                    _layerStatus.L4 = 'error';
                    logIntrusion(`L4 統計資料異常 — losses: ${data.losses}`);
                    return false;
                }
                if (data.silver !== undefined && (data.silver < 0 || data.silver > 999999)) {
                    _layerStatus.L4 = 'error';
                    logIntrusion(`L4 銀兩資料竄改嘗試 — silver: ${data.silver}`);
                    _addThreat(50);
                    return false;
                }
            }
            if (type === 'chat_msg') {
                if (typeof data.text !== 'string' || data.text.length > 300) {
                    _layerStatus.L4 = 'warn';
                    return false;
                }
            }
        } catch {}
        return true;
    }

    // ════════════════════════════════════════════════════════
    //  § 10  防火牆 L5 — 會話完整性
    // ════════════════════════════════════════════════════════
    function bindSession(username) {
        _sessionFp = username;
        _log(LEVEL.INFO, CAT.L5, `L5 綁定會話：${username}`);
    }

    function validateSession() {
        if (!_sessionFp) return true;
        const ok = _sessionOk();
        if (!ok) {
            _layerStatus.L5 = 'error';
            logIntrusion(`L5 會話完整性失敗 — 可能遭會話劫持（預期使用者：${_sessionFp}）`);
            _addThreat(40);
        }
        return ok;
    }

    // 定期 L5 檢查（每 30s）
    setInterval(() => {
        if (_sessionFp) validateSession();
    }, 30000);

    // ════════════════════════════════════════════════════════
    //  § 11  暴力破解防護
    // ════════════════════════════════════════════════════════
    function recordFailedLogin(username) {
        const now = Date.now();
        if (!_failedLogins[username]) _failedLogins[username] = { count: 0, firstAt: now };
        const d = _failedLogins[username];
        if (now - d.firstAt > 5 * 60000) { d.count = 0; d.firstAt = now; delete d.blockUntil; }

        d.count++;
        _log(LEVEL.WARN, CAT.SECURITY, `帳號 ${username} 登入失敗（第 ${d.count} 次）`);
        _addThreat(5);

        if (d.count >= 5) {
            d.blockUntil = now + 5 * 60000;
            logIntrusion(`暴力破解防護啟動 — 帳號 ${username} 失敗 ${d.count} 次，已鎖定 5 分鐘`);
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
        _layerStatus.L1 = 'ok';
        bindSession(username);
        _log(LEVEL.INFO, CAT.OPS, `帳號 ${username} 登入成功`);
    }

    // ════════════════════════════════════════════════════════
    //  § 12  入侵預警系統
    // ════════════════════════════════════════════════════════
    function _triggerIntrusionAlert(detail) {
        const overlay = document.getElementById('intrusion-alert-overlay');
        const txt     = document.getElementById('intrusion-detail-text');
        if (!overlay) return;
        if (txt) txt.textContent = detail.slice(0, 120);
        overlay.classList.remove('hidden');

        // 15 秒後自動關閉
        clearTimeout(_triggerIntrusionAlert._timer);
        _triggerIntrusionAlert._timer = setTimeout(() => {
            overlay.classList.add('hidden');
        }, 15000);

        // 更新指示燈為紅
        _status = 'red';
        _updateLight();

        // 更新入侵計數
        const cntEl = document.getElementById('mon-intrusion-cnt');
        if (cntEl) cntEl.textContent = _intrusionCnt;
    }
    _triggerIntrusionAlert._timer = null;

    window._dismissIntrusionAlert = function () {
        const overlay = document.getElementById('intrusion-alert-overlay');
        if (overlay) overlay.classList.add('hidden');
    };

    // ════════════════════════════════════════════════════════
    //  § 13  模塊完整性掃描器
    // ════════════════════════════════════════════════════════
    async function runScan() {
        _log(LEVEL.INFO, CAT.SCAN, '開始模塊完整性掃描...');
        const results = [];
        let allOk = true;

        for (const chk of MODULE_CHECKS) {
            let status = 'ok', detail = '正常';
            try {
                const ok = chk.fn();
                if (!ok) {
                    status  = 'error';
                    detail  = '異常或未回應';
                    allOk   = false;
                    _log(LEVEL.CRITICAL, CAT.SCAN, `掃描異常：${chk.label} — ${detail}`, true);
                }
            } catch (e) {
                status  = 'error';
                detail  = e.message?.slice(0, 50) || '例外錯誤';
                allOk   = false;
                _log(LEVEL.CRITICAL, CAT.SCAN, `掃描例外：${chk.label} — ${detail}`, true);
            }
            results.push({ id: chk.id, label: chk.label, status, detail });
        }

        // Firebase 連線測試
        const fbStart = Date.now();
        await _fbGet('/sys_ping');
        const fbMs = Date.now() - fbStart;
        results.push({
            id: 'fb_ping', label: `Firebase 延遲 (${fbMs}ms)`,
            status: _fbReachable ? 'ok' : 'error',
            detail: _fbReachable ? `回應 ${fbMs}ms` : '無法連線'
        });

        _lastScanResults = results;
        _lastScanTime    = Date.now();
        _log(LEVEL.INFO, CAT.SCAN, `掃描完成：${results.filter(r => r.status === 'ok').length}/${results.length} 項正常`);

        if (!allOk) {
            logIntrusion(`掃描發現 ${results.filter(r => r.status === 'error').length} 個模塊異常，可能遭入侵`);
        }

        return results;
    }

    // 每 5 分鐘自動掃描
    setInterval(() => runScan(), 5 * 60000);

    // ════════════════════════════════════════════════════════
    //  § 14  狀態查詢 API
    // ════════════════════════════════════════════════════════
    function onStatusChange(cb) { _statusCbs.push(cb); }
    function getStatus()        { return _status; }
    function getThreatScore()   { return _threatScore; }
    function getLocalLogs(cat, n) {
        const src = cat ? (_logs[cat] || []) : Object.values(_logs).flat().sort((a, b) => b.t - a.t);
        return src.slice(0, n || 100);
    }

    async function getRemoteLogs(days) {
        const all = [];
        for (let i = 0; i < (days || 3); i++) {
            const dk = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
            const data = await _fbGet(`/sys_logs/${dk}`);
            if (data) Object.values(data).forEach(e => all.push(e));
        }
        return all.sort((a, b) => b.t - a.t);
    }

    // ════════════════════════════════════════════════════════
    //  § 15  UI — 防火牆指示燈
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
    //  § 16  UI — 監控面板渲染
    // ════════════════════════════════════════════════════════

    // 監控面板開/關
    window._openSecurityMonitor = function () {
        const modal = document.getElementById('security-monitor');
        if (!modal) return;
        modal.classList.remove('hidden');
        _monTab   = 'security';
        _logFilter = 'all';
        _renderMonitor();
    };
    // 向下相容舊名稱
    window._openSecurityDashboard  = window._openSecurityMonitor;

    window._closeSecurityMonitor = function () {
        const modal = document.getElementById('security-monitor');
        if (modal) modal.classList.add('hidden');
    };
    window._closeSecurityDashboard = window._closeSecurityMonitor;

    // 頁籤切換
    window._monTab = function (tab) {
        _monTab = tab;
        _renderMonitor();
    };

    // 日誌篩選
    window._monLogFilter = function (f) {
        _logFilter = f;
        _renderMonTabContent();
    };

    // 刷新
    window._monRefresh = async function () {
        const btn = document.getElementById('mon-refresh-btn');
        if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
        try {
            const remote = await getRemoteLogs(1);
            remote.forEach(e => {
                const b = _logs[e.cat] || _logs.security;
                if (!b.some(l => l.t === e.t)) { b.unshift(e); }
            });
            Object.values(_logs).forEach(arr => arr.splice(200));
            _renderMonitor();
        } finally {
            if (btn) { btn.textContent = '🔄'; btn.disabled = false; }
        }
    };

    // 執行掃描按鈕
    window._runScanBtn = async function () {
        const btn = document.getElementById('mon-scan-btn');
        if (btn) { btn.textContent = '⏳ 掃描中…'; btn.disabled = true; }
        try {
            await runScan();
            _renderMonitor();
        } finally {
            if (btn) { btn.textContent = '▶ 立即掃描'; btn.disabled = false; }
        }
    };

    // 測試警報郵件
    window._monTestAlert = function () {
        const btn = document.getElementById('mon-test-email-btn');
        if (btn) { btn.textContent = '⏳…'; btn.disabled = true; }
        _sendEmail('📧 測試告警', `防火牆運作正常，這是一封測試郵件。\nIP：${_clientIp || '?'}\n時間：${_ts()}`);
        _log(LEVEL.INFO, CAT.SECURITY, '管理員發送了測試警報郵件');
        setTimeout(() => {
            if (btn) { btn.textContent = '✅ 已發送'; setTimeout(() => { if (btn) { btn.textContent = '📧 發送測試郵件'; btn.disabled = false; } }, 2000); }
        }, 1000);
    };

    // ── 主渲染函數 ───────────────────────────────────────────
    function _renderMonitor() {
        _renderMonHeader();
        _renderLayerGrid();
        _renderTabBar();
        _renderMonTabContent();
    }

    function _renderMonHeader() {
        const thr = document.getElementById('mon-threat-val');
        const cnt = document.getElementById('mon-intrusion-cnt');
        const tot = document.getElementById('mon-total-logs');
        const ip  = document.getElementById('mon-ip-display');
        if (thr) {
            const C = _threatScore >= 50 ? '#ff4444' : _threatScore >= 20 ? '#ffcc00' : '#00ff88';
            thr.innerHTML = `<span style="color:${C}">${_threatScore}</span><span style="color:#1a4a28;font-size:10px;">/100</span>`;
        }
        if (cnt) { cnt.textContent = _intrusionCnt; cnt.style.color = _intrusionCnt > 0 ? '#ff4444' : '#00ff88'; }
        if (tot) tot.textContent = Object.values(_logs).reduce((s, a) => s + a.length, 0);
        if (ip && _clientIp) ip.textContent = _clientIp;
    }

    function _renderLayerGrid() {
        const el = document.getElementById('mon-layer-grid');
        if (!el) return;

        const layers = [
            ...FW_LAYERS.map(l => ({ id: l.id, label: l.label, status: _layerStatus[l.id] || 'ok' })),
            { id: 'auth',  label: 'Auth 模塊',   status: typeof window.Auth !== 'undefined' ? 'ok' : 'error' },
            { id: 'db',    label: 'Firebase',     status: _fbReachable ? 'ok' : 'error'                       },
            { id: 'email', label: '監控郵件',     status: typeof emailjs !== 'undefined' ? 'ok' : 'warn'      },
        ];

        const C = { ok: '#00ff88', warn: '#ffcc00', error: '#ff4444' };
        const T = { ok: '正常',   warn: '警告',    error: '異常'    };
        const BG = { ok: 'rgba(0,255,136,0.06)', warn: 'rgba(255,204,0,0.06)', error: 'rgba(255,68,68,0.08)' };
        const BD = { ok: 'rgba(0,255,136,0.18)', warn: 'rgba(255,204,0,0.18)', error: 'rgba(255,68,68,0.25)' };

        el.innerHTML = layers.map(l => `
            <div style="background:${BG[l.status]};border:1px solid ${BD[l.status]};border-radius:7px;padding:7px 9px;display:flex;align-items:center;gap:6px;min-width:0;">
                <div style="width:7px;height:7px;border-radius:50%;flex-shrink:0;background:${C[l.status]};box-shadow:0 0 5px ${C[l.status]};"></div>
                <div style="min-width:0;">
                    <div style="color:${C[l.status]};font-size:10px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${l.label}</div>
                    <div style="color:#2a5a3a;font-size:9px;">${T[l.status]}</div>
                </div>
            </div>`).join('');
    }

    const _TAB_CFG = [
        { id: 'security',  label: '🔒 安全日誌',   icon: '🔒' },
        { id: 'intrusion', label: '🚨 入侵日誌',   icon: '🚨' },
        { id: 'db_access', label: '🗃 DB 訪問',    icon: '🗃' },
        { id: 'error',     label: '❌ 系統錯誤',   icon: '❌' },
        { id: 'ops',       label: '📌 操作記錄',   icon: '📌' },
        { id: 'scan',      label: '🔍 系統檢測',   icon: '🔍' },
    ];

    function _renderTabBar() {
        const el = document.getElementById('mon-tab-bar');
        if (!el) return;
        el.innerHTML = _TAB_CFG.map(t => {
            const isOn = t.id === _monTab;
            const cnt = t.id !== 'scan' ? (_logs[t.id] || []).length : (_lastScanResults.length || '');
            const badge = cnt ? `<span style="background:${isOn?'rgba(0,255,136,0.2)':'rgba(255,255,255,0.06)'};padding:1px 5px;border-radius:8px;margin-left:4px;font-size:9px;">${cnt}</span>` : '';
            return `<button onclick="window._monTab('${t.id}')" style="flex-shrink:0;padding:6px 11px;border-radius:6px 6px 0 0;border:1px solid ${isOn?'rgba(0,255,136,0.35)':'#0d2015'};border-bottom:none;background:${isOn?'rgba(0,255,136,0.1)':'none'};color:${isOn?'#00ff88':'#2a5a3a'};font-size:10px;cursor:pointer;font-family:inherit;letter-spacing:0.5px;white-space:nowrap;transition:all .2s;">${t.label}${badge}</button>`;
        }).join('');
    }

    function _renderMonTabContent() {
        const el = document.getElementById('mon-tab-content');
        if (!el) return;

        if (_monTab === 'scan') { _renderScanPanel(el); return; }

        const isOps   = _monTab === 'ops';
        const isDBAcc = _monTab === 'db_access';
        const isIntr  = _monTab === 'intrusion';

        // 篩選列（只有安全日誌類有等級篩選，入侵/DB/ops/error沒有）
        const showFilter = (_monTab === 'security' || _monTab === 'error');

        let html = '';
        if (showFilter) {
            html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:6px;flex-wrap:wrap;">
                <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    ${['all','critical','warn','info'].map(f => `
                        <button onclick="window._monLogFilter('${f}')" id="mfilter-${f}" style="background:${_logFilter===f?'rgba(0,255,136,0.14)':'none'};border:1px solid ${_logFilter===f?'rgba(0,255,136,0.38)':'#0d2015'};color:${_logFilter===f?'#00ff88':'#2a5a3a'};padding:3px 9px;border-radius:4px;font-size:10px;cursor:pointer;font-family:inherit;transition:all .2s;">${{all:'全部',critical:'🚨危急',warn:'⚠️警告',info:'ℹ️資訊'}[f]}</button>`).join('')}
                </div>
                <button id="mon-refresh-btn" onclick="window._monRefresh()" style="background:none;border:1px solid #0d2015;color:#2a5a3a;padding:3px 10px;border-radius:4px;font-size:10px;cursor:pointer;font-family:inherit;" onmouseover="this.style.color='#00ff88'" onmouseout="this.style.color='#2a5a3a'">🔄</button>
            </div>`;
        } else {
            html += `<div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
                <button id="mon-refresh-btn" onclick="window._monRefresh()" style="background:none;border:1px solid #0d2015;color:#2a5a3a;padding:3px 10px;border-radius:4px;font-size:10px;cursor:pointer;font-family:inherit;" onmouseover="this.style.color='#00ff88'" onmouseout="this.style.color='#2a5a3a'">🔄 刷新</button>
            </div>`;
        }

        // 日誌資料
        let list = _logs[_monTab] || [];
        if (showFilter && _logFilter !== 'all') {
            list = list.filter(e => e.lv === _logFilter);
        }

        if (list.length === 0) {
            html += `<div style="color:#1a4a28;text-align:center;padding:32px 0;font-size:12px;">── 暫無記錄 ──</div>`;
        } else {
            const BG  = { info: 'rgba(0,255,136,0.03)',  warn: 'rgba(255,204,0,0.04)',  critical: 'rgba(255,68,68,0.06)' };
            const BD  = { info: 'rgba(0,255,136,0.09)',  warn: 'rgba(255,204,0,0.12)',  critical: 'rgba(255,68,68,0.20)' };
            const COL = { info: '#2a6a4a',               warn: '#7a6a20',               critical: '#7a2a2a'              };
            const IC  = { info: 'ℹ️',                    warn: '⚠️',                    critical: '🚨'                   };

            html += list.slice(0, 150).map(e => {
                const dt = new Date(e.t);
                const ts = dt.toLocaleString('zh-TW', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' });
                const ipInfo = e.ip ? `<span style="color:#1a3a2a;font-size:9px;"> | IP: ${e.ip}</span>` : '';
                const userInfo = e.user ? `<span style="color:#2a5a3a;font-size:9px;"> | 👤 ${e.user}</span>` : '';
                const lv = e.lv || 'info';
                return `<div style="background:${BG[lv]||BG.info};border:1px solid ${BD[lv]||BD.info};border-radius:6px;padding:7px 10px;font-size:11px;line-height:1.5;margin-bottom:3px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1px;flex-wrap:wrap;gap:4px;">
                        <span style="color:${COL[lv]||COL.info};font-weight:700;">${IC[lv]||'📝'} ${e.cat || ''}${isIntr?'':''}</span>
                        <span style="color:#1a4a28;font-size:9px;">${ts}${ipInfo}${userInfo}</span>
                    </div>
                    <div style="color:#4a7a5a;">${e.msg}</div>
                </div>`;
            }).join('');
        }

        el.innerHTML = html;
    }

    function _renderScanPanel(el) {
        let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <div style="color:#1a4a28;font-size:10px;letter-spacing:1px;">${_lastScanTime ? '上次掃描：' + new Date(_lastScanTime).toLocaleTimeString('zh-TW') : '尚未執行掃描'}</div>
            <button id="mon-scan-btn" onclick="window._runScanBtn()" style="background:linear-gradient(135deg,#041a0a,#072010);border:1px solid rgba(0,255,136,0.25);color:#00ff88;padding:5px 14px;border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit;letter-spacing:1px;transition:all .2s;" onmouseover="this.style.borderColor='rgba(0,255,136,0.55)'" onmouseout="this.style.borderColor='rgba(0,255,136,0.25)'">▶ 立即掃描</button>
        </div>`;

        if (_lastScanResults.length === 0) {
            html += `<div style="color:#1a4a28;text-align:center;padding:32px 0;font-size:12px;">── 點擊「立即掃描」開始系統檢測 ──</div>`;
        } else {
            const ok  = _lastScanResults.filter(r => r.status === 'ok').length;
            const err = _lastScanResults.filter(r => r.status === 'error').length;
            const C   = err > 0 ? '#ff4444' : ok === _lastScanResults.length ? '#00ff88' : '#ffcc00';
            html += `<div style="text-align:center;margin-bottom:12px;padding:10px;background:rgba(0,0,0,0.3);border-radius:8px;border:1px solid ${C}44;">
                <span style="color:${C};font-size:16px;font-weight:900;">${ok}/${_lastScanResults.length}</span>
                <span style="color:#2a5a3a;font-size:11px;margin-left:6px;">項目正常</span>
                ${err > 0 ? `<span style="color:#ff4444;font-size:11px;margin-left:10px;">⚠ ${err} 項異常</span>` : ''}
            </div>`;

            html += _lastScanResults.map(r => {
                const C2 = { ok: '#00ff88', warn: '#ffcc00', error: '#ff4444' }[r.status];
                const BG2 = { ok: 'rgba(0,255,136,0.04)', warn: 'rgba(255,204,0,0.04)', error: 'rgba(255,68,68,0.07)' }[r.status];
                const IC2 = { ok: '✓', warn: '⚠', error: '✗' }[r.status];
                return `<div style="background:${BG2};border:1px solid ${C2}22;border-radius:6px;padding:8px 12px;display:flex;align-items:center;gap:10px;margin-bottom:4px;">
                    <div style="font-size:14px;color:${C2};flex-shrink:0;font-weight:900;">${IC2}</div>
                    <div style="flex:1;min-width:0;">
                        <div style="color:${C2};font-size:11px;font-weight:700;">${r.label}</div>
                        <div style="color:#2a5a3a;font-size:10px;margin-top:1px;">${r.detail}</div>
                    </div>
                </div>`;
            }).join('');
        }

        // 電子郵件測試區
        html += `<div style="margin-top:14px;padding-top:12px;border-top:1px solid #0a1c0f;">
            <div style="font-size:10px;color:#1a4a28;letter-spacing:1px;margin-bottom:8px;">── 監控郵件設定 ──</div>
            <div style="background:#041208;border:1px solid #0a1c0f;border-radius:8px;padding:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span style="color:#3a6a4a;font-size:11px;">收件人</span>
                    <span style="color:#00ff88;font-size:11px;font-weight:700;">linus622wang@gmail.com</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                    <span style="color:#3a6a4a;font-size:11px;">觸發等級</span>
                    <span style="color:#ffcc00;font-size:11px;font-weight:700;">CRITICAL（自動）</span>
                </div>
                <button id="mon-test-email-btn" onclick="window._monTestAlert()" style="width:100%;background:#041a0a;border:1px solid rgba(0,255,136,0.18);color:#00ff88;padding:8px;border-radius:6px;font-size:11px;font-family:inherit;cursor:pointer;letter-spacing:1px;transition:all .2s;" onmouseover="this.style.borderColor='rgba(0,255,136,0.45)'" onmouseout="this.style.borderColor='rgba(0,255,136,0.18)'">📧 發送測試告警郵件</button>
            </div>
        </div>`;

        el.innerHTML = html;
    }

    // 即時更新（日誌面板開著時）
    function _updateMonitorLive(category, entry) {
        const modal = document.getElementById('security-monitor');
        if (!modal || modal.classList.contains('hidden')) return;
        _renderMonHeader();
        if (_monTab === category || (_monTab === 'security' && !['db_access','ops','scan','intrusion','error'].includes(category))) {
            _renderMonTabContent();
        }
        if (_monTab === category) _renderTabBar();
    }

    // ════════════════════════════════════════════════════════
    //  § 17  初始化
    // ════════════════════════════════════════════════════════
    function init() {
        if (_initialized) { _updateLight(); return; }
        _initialized = true;

        // 非同步解析 IP
        _resolveIp().then(ip => {
            _log(LEVEL.INFO, CAT.SYSTEM, `🛡 防火牆安全系統啟動 v20260527n | 客戶端 IP：${ip}`);
            const ipEl = document.getElementById('mon-ip-display');
            if (ipEl) ipEl.textContent = ip;
        });

        _updateLight();

        // 監聽 JS 錯誤
        window.addEventListener('error', e => {
            logError(e.message || '未知錯誤', e.filename ? `${e.filename}:${e.lineno}` : '');
        });

        // 監聽 Promise 拒絕
        window.addEventListener('unhandledrejection', e => {
            logError(`UnhandledPromise: ${String(e.reason).slice(0, 80)}`);
        });

        // 首次延遲 3 秒執行掃描（等其他模塊載入）
        setTimeout(() => runScan(), 3000);
    }

    // ════════════════════════════════════════════════════════
    //  § 18  Public API
    // ════════════════════════════════════════════════════════
    window.HuaXiaSecurity = {
        LEVEL, CAT,
        init,
        // 多層防火牆
        validateInput,      // L1
        checkRate,          // L2
        trackBehavior,      // L3
        validateCoreData,   // L4
        validateSession,    // L5
        bindSession,
        // 日誌
        recordEvent,
        logDbAccess,
        logOps,
        logError,
        logIntrusion,
        // 暴力破解
        recordFailedLogin,
        recordSuccessLogin,
        isLoginBlocked,
        getBlockRemaining,
        // 查詢
        getStatus,
        getThreatScore,
        onStatusChange,
        getLocalLogs,
        getRemoteLogs,
        // 掃描
        runScan,
    };
})();
