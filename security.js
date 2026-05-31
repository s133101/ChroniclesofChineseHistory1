// ============================================================
//  華夏風雲錄 — security.js  v20260528d
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
        SECURITY : 'security',   // ← 安全日誌（修正：原版遺漏此常數）
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

    const RATE_CFG = {
        login   : { max: 5,   ms: 5  * 60000, label: '登入'     },
        register: { max: 3,   ms: 60 * 60000, label: '註冊'     },
        verify  : { max: 5,   ms: 5  * 60000, label: '驗證碼'   },
        fb_write: { max: 80,  ms: 60000,       label: '資料寫入' },
        fb_read : { max: 300, ms: 60000,       label: '資料讀取' },
        chat    : { max: 12,  ms: 30000,       label: '聊天訊息' },
    };

    const FW_LAYERS = [
        { id: 'L1', label: 'L1 輸入驗證',   desc: 'XSS / SQL 注入 / 路徑穿越 / 協議注入' },
        { id: 'L2', label: 'L2 速率限制',   desc: '各操作頻率上限，防止洪水 / DoS 攻擊' },
        { id: 'L3', label: 'L3 行為分析',   desc: '偵測機器人行為 / 異常請求模式'         },
        { id: 'L4', label: 'L4 資料完整性', desc: '核心數值寫入前合法性驗證'              },
        { id: 'L5', label: 'L5 會話驗證',   desc: '會話完整性 / 劫持偵測'                 },
    ];

    const MODULE_CHECKS = [
        { id: 'fw_l1',  label: 'L1 輸入驗證',   fn: () => typeof window.HuaXiaSecurity?.validateInput    === 'function' },
        { id: 'fw_l2',  label: 'L2 速率限制',   fn: () => typeof window.HuaXiaSecurity?.checkRate        === 'function' },
        { id: 'fw_l3',  label: 'L3 行為分析',   fn: () => _behaviorOk()                                                  },
        { id: 'fw_l4',  label: 'L4 資料完整性', fn: () => typeof window.HuaXiaSecurity?.validateCoreData === 'function' },
        { id: 'fw_l5',  label: 'L5 會話驗證',   fn: () => _sessionOk()                                                   },
        // Auth 模塊：init() 後 20s 內寬限，避免 auth.js 載入競爭誤報
        { id: 'auth',   label: 'Auth 驗證模塊',  fn: () => typeof Auth !== 'undefined' || (_startTime > 0 && Date.now() - _startTime < 20000) },
        { id: 'db',     label: 'Firebase 連線',  fn: () => _fbReachable                                                   },
        { id: 'dom',    label: '核心 DOM 元素',  fn: () => !!document.getElementById('lobby-screen')                     },
        { id: 'email',  label: '監控郵件模塊',   fn: () => typeof emailjs !== 'undefined'                                 },
        // L1 功能驗證：使用靜默模式，避免觸發真實入侵警報 + 威脅分數
        { id: 'l1func', label: 'L1 功能驗證',   fn: () => { try { return _validateInputSilent('chat', '<script>x</script>') === false; } catch { return false; } } },
    ];

    const _ATTACK_PATS = [
        { n: 'XSS',      re: /<script|javascript:|on\w+\s*=|<iframe|<svg.*on|eval\s*\(|document\.\w/i },
        { n: 'SQL',      re: /\bUNION\b.*\bSELECT\b|\bDROP\b\s+\bTABLE\b|\bINSERT\b\s+\bINTO\b/i    },
        { n: 'PATH',     re: /\.\.[/\\]/                                                               },
        { n: 'PROTO',    re: /^(javascript|data|vbscript):/i                                           },
        { n: 'CMD',      re: /[;&|`$]|\bexec\b|\bsystem\b|\bpasswd\b/i                                },
        // P2 新增攻擊模式
        { n: 'TEMPLATE', re: /\{\{[\s\S]*?\}\}/                                                        }, // Server-Side 模板注入
        { n: 'NULLBYTE', re: /\x00/                                                                    }, // Null Byte 注入
    ];

    // ════════════════════════════════════════════════════════
    //  § 1  狀態
    // ════════════════════════════════════════════════════════
    let _initialized  = false;
    let _status       = 'green';
    let _threatScore  = 0;
    let _clientIp     = null;
    let _fbReachable  = true;
    let _intrusionCnt = 0;
    let _statusCbs    = [];
    let _monTab       = 'security';
    let _logFilter    = 'all';

    const _logs = {
        security : [],
        intrusion: [],
        db_access: [],
        error    : [],
        ops      : [],
        scan     : [],
    };

    const _layerStatus  = { L1: 'ok', L2: 'ok', L3: 'ok', L4: 'ok', L5: 'ok' };
    const _failedLogins = {};

    // ── IP 封鎖 ──────────────────────────────────────────────
    const _IP_BLOCK_THRESHOLD = 3;          // 同 IP 入侵次數上限
    const _IP_BLOCK_DURATION  = 24 * 3600000; // 封鎖時長 24 小時
    const _ipIntrusionCount   = {};          // 本 session IP 入侵計數
    const _behaviorTrack = {};
    let   _l3Healthy    = true;
    let   _sessionFp    = null;

    let _lastScanResults = [];
    let _lastScanTime    = 0;

    // ── 日誌斷層追蹤 ────────────────────────────────────────
    let _lastLogTime  = Date.now();  // 上次寫入日誌的時間戳
    let _gapAlertSent = false;       // 避免重複發相同斷層警報

    // ── P1：L2 記憶體雙重速率鎖（清除 localStorage 無法繞過）────
    const _memRateLimit = {};

    // ── P1：郵件告警節流（同主旨 5 分鐘內只發一封）────────────
    const _emailThrottle   = new Map();
    const _EMAIL_THROTTLE  = 5 * 60000;

    // ── 廣播節流（最多每 5s 寫一次 Firebase，防止過量寫入）────
    let _lastBroadcast = 0;

    // ── 啟動時間（在 init() 設定，供 Auth 模塊載入競爭判斷用）──
    let _startTime = 0;

    // ════════════════════════════════════════════════════════
    //  § 2  工具 helpers
    // ════════════════════════════════════════════════════════
    function _ts() {
        return new Date().toLocaleString('zh-TW', {
            month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    }

    async function _resolveIp() {
        if (_clientIp) return _clientIp;
        try {
            const r = await fetch('https://api64.ipify.org?format=json', { signal: AbortSignal.timeout(4000) });
            const d = await r.json();
            _clientIp = d.ip || '未知';
        } catch { _clientIp = '無法取得'; }
        return _clientIp;
    }

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

    function _behaviorOk() { return _l3Healthy; }

    function _sessionOk() {
        if (!_sessionFp) return true;
        const cur = sessionStorage.getItem('hua_session');
        if (!cur) return true;
        try { const s = JSON.parse(cur); return _sessionFp === s.username; }
        catch { return false; }
    }

    // ════════════════════════════════════════════════════════
    //  § 3  EmailJS 告警發信
    // ════════════════════════════════════════════════════════
    function _sendEmail(subject, body) {
        if (typeof emailjs === 'undefined') return;
        // P1 節流：同主旨 5 分鐘內只發一封，防止攻擊洪流耗盡 EmailJS 額度
        const last = _emailThrottle.get(subject) || 0;
        if (Date.now() - last < _EMAIL_THROTTLE) {
            console.log(`[🛡 FW] 郵件節流：「${subject}」距上次發送僅 ${Math.round((Date.now()-last)/1000)}s，略過`);
            return;
        }
        _emailThrottle.set(subject, Date.now());
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

        // 更新最後日誌時間（斷層偵測用）
        _lastLogTime  = Date.now();
        _gapAlertSent = false;  // 有新日誌 → 重置斷層警報旗標

        // 分類本地快取
        const bucket = _logs[category] || _logs.security;
        bucket.unshift(entry);
        if (bucket.length > 200) bucket.splice(200);

        // Firebase 非同步寫入
        const dk = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        _fbPatch(`/sys_logs/${dk}/${id}`, entry);

        console.log(`[🛡 FW:${category}] [${level.toUpperCase()}] ${detail} | IP:${ip}`);

        if (alertEmail) {
            _sendEmail(`[${level}] ${category}: ${detail}`,
                `操作者：${user}\nIP：${ip}\n時間：${_ts()}\n詳情：${detail}`);
        }

        _updateMonitorLive(category, entry);
    }

    function _currentUser() {
        try {
            const s = JSON.parse(sessionStorage.getItem('hua_session') || 'null');
            return s?.username || '未登入';
        } catch { return '?'; }
    }

    function recordEvent(level, category, detail) {
        _log(level, category || CAT.SYSTEM, detail, level === LEVEL.CRITICAL);
    }
    function logDbAccess(op, path, user) {
        _log(LEVEL.INFO, CAT.DB_ACCESS, `${op} → ${path} ← ${user || _currentUser()}`);
    }
    function logOps(action) {
        _log(LEVEL.INFO, CAT.OPS, action);
    }
    function logError(msg, stack) {
        _log(LEVEL.WARN, CAT.ERROR, `${msg}${stack ? ' | ' + stack.slice(0, 80) : ''}`);
    }
    function logIntrusion(detail) {
        _intrusionCnt++;
        _log(LEVEL.CRITICAL, CAT.INTRUSION, detail, true);
        _triggerIntrusionAlert(detail);
        _addThreat(30);
        // IP 封鎖計數
        if (_clientIp) {
            _ipIntrusionCount[_clientIp] = (_ipIntrusionCount[_clientIp] || 0) + 1;
            if (_ipIntrusionCount[_clientIp] >= _IP_BLOCK_THRESHOLD) {
                _blockCurrentIp(detail);
            }
        }
    }

    // ── 封鎖目前 IP ──────────────────────────────────────────
    async function _blockCurrentIp(reason) {
        if (!_clientIp) return;
        const key = _clientIp.replace(/[.:]/g, '_');
        const existing = await _fbGet(`/ip_blacklist/${key}`);
        if (existing && Date.now() < existing.until) return; // 已封鎖
        await _fbPatch(`/ip_blacklist/${key}`, {
            ip:        _clientIp,
            reason:    reason.slice(0, 100),
            blockedAt: Date.now(),
            until:     Date.now() + _IP_BLOCK_DURATION,
            count:     _ipIntrusionCount[_clientIp]
        });
        _log(LEVEL.CRITICAL, CAT.INTRUSION,
            `🚫 IP ${_clientIp} 已自動封鎖 24 小時（入侵 ${_ipIntrusionCount[_clientIp]} 次）`, true);
    }

    // ── 啟動時檢查 IP 是否在黑名單 ───────────────────────────
    async function _checkIpBlacklist() {
        if (!_clientIp) return;
        const key = _clientIp.replace(/[.:]/g, '_');
        const data = await _fbGet(`/ip_blacklist/${key}`);
        if (!data) return;
        if (Date.now() > data.until) {
            // 封鎖已過期，移除
            fetch(_FB + `/ip_blacklist/${key}.json`, { method: 'DELETE' }).catch(() => {});
            return;
        }
        // 封鎖中 → 顯示封鎖頁面
        const remaining = Math.ceil((data.until - Date.now()) / 3600000);
        const wall = document.createElement('div');
        wall.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0a0000;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:"Noto Serif TC",serif;color:#ff4444;text-align:center;padding:40px;';
        wall.innerHTML = `
            <div style="font-size:64px;margin-bottom:16px;">🚫</div>
            <div style="font-size:22px;font-weight:900;margin-bottom:8px;">存取遭封鎖</div>
            <div style="font-size:13px;color:#aa4444;margin-bottom:20px;">Access Blocked</div>
            <div style="background:rgba(255,0,0,0.08);border:1px solid rgba(255,68,68,0.25);border-radius:12px;padding:20px 32px;max-width:420px;line-height:2;">
                <div style="color:#ff6666;">您的 IP（${_clientIp}）因多次入侵行為已被系統封鎖</div>
                <div style="color:#884444;font-size:12px;margin-top:8px;">剩餘封鎖時間：約 ${remaining} 小時</div>
            </div>`;
        document.body.appendChild(wall);
        _log(LEVEL.CRITICAL, CAT.INTRUSION, `IP ${_clientIp} 嘗試存取但在黑名單中（剩 ${remaining}h）`);
    }

    // ════════════════════════════════════════════════════════
    //  § 5  威脅分數 & 狀態
    // ════════════════════════════════════════════════════════
    function _addThreat(n) { _threatScore = Math.min(100, _threatScore + n); _refreshStatus(); }

    function _refreshStatus() {
        const prev = _status;
        _status = _threatScore >= 50 ? 'red' : _threatScore >= 20 ? 'yellow' : 'green';
        if (_status !== prev) {
            _statusCbs.forEach(cb => { try { cb(_status, _threatScore); } catch {} });
            _updateLight();
            _broadcastState(); // 狀態改變時立即廣播
        }
    }

    // ════════════════════════════════════════════════════════
    //  廣播安全狀態至 Firebase（供 Monitor APP 即時讀取）
    // ════════════════════════════════════════════════════════
    function _broadcastState() {
        const now = Date.now();
        if (now - _lastBroadcast < 5000) return; // 節流：最多每 5s 一次
        _lastBroadcast = now;
        const snap = {
            status      : _status,
            threatScore : _threatScore,
            intrusionCnt: _intrusionCnt,
            totalLogs   : Object.values(_logs).reduce((s, a) => s + a.length, 0),
            layers      : { ..._layerStatus },
            modules     : {
                auth : (typeof Auth !== 'undefined' || (_startTime > 0 && Date.now() - _startTime < 20000)) ? 'ok' : 'error',
                db   : _fbReachable                       ? 'ok' : 'error',
                email: typeof emailjs     !== 'undefined' ? 'ok' : 'warn',
                gap  : (now - _lastLogTime) > 10 * 60000 ? 'error'
                     : (now - _lastLogTime) >  5 * 60000 ? 'warn' : 'ok',
            },
            clientIp : _clientIp || '?',
            updatedAt: now,
        };
        _fbPatch('/security_state/snapshot', snap);
    }

    // ── 每 60s 威脅分數自然衰減 ──────────────────────────────
    setInterval(() => {
        if (_threatScore > 0) { _threatScore = Math.max(0, _threatScore - 5); _refreshStatus(); }
    }, 60000);

    // ── 心跳日誌（每 2 分鐘）────────────────────────────────
    setInterval(() => {
        if (!_initialized) return;
        const S = { green: '✅ 安全', yellow: '⚠️ 警戒', red: '🔴 危險' }[_status] || '?';
        _log(LEVEL.INFO, CAT.SYSTEM,
            `💓 心跳 — 防火牆 ${S}，威脅分數 ${_threatScore}/100，入侵計數 ${_intrusionCnt}`);
    }, 2 * 60000);

    // ── 日誌斷層偵測（每 60s 檢查）──────────────────────────
    // 規則：
    //   > 5 min 無日誌  → WARN（黃燈）
    //   > 10 min 無日誌 → CRITICAL（紅燈）+ 入侵預警 + 郵件
    setInterval(() => {
        if (!_initialized) return;
        const gapMs  = Date.now() - _lastLogTime;
        const gapMin = Math.floor(gapMs / 60000);

        if (gapMs > 10 * 60000 && !_gapAlertSent) {
            _gapAlertSent = true;
            _addThreat(25);
            // 直接操作 bucket（不呼叫 _log 避免時序問題）
            const alertEntry = {
                t: Date.now(), lv: LEVEL.CRITICAL,
                cat: CAT.INTRUSION,
                msg: `🚨 日誌斷層警戒：系統已 ${gapMin} 分鐘無日誌活動，可能遭入侵或記錄被竄改`,
                ip: _clientIp || '?', user: _currentUser(), ua: navigator.userAgent.slice(0, 60)
            };
            _logs.intrusion.unshift(alertEntry);
            _logs.security.unshift(alertEntry);
            const dk = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            _fbPatch(`/sys_logs/${dk}/${Date.now()}_gap`, alertEntry);
            _sendEmail('🔴 日誌斷層警戒',
                `系統已 ${gapMin} 分鐘無日誌活動\n可能遭入侵或日誌記錄被竄改\nIP：${_clientIp || '?'}\n時間：${_ts()}`);
            _intrusionCnt++;
            _triggerIntrusionAlert(`日誌斷層警戒：${gapMin} 分鐘無活動，疑似遭入侵`);
            _updateLight();
            console.warn(`[🛡 FW] 🚨 日誌斷層：${gapMin} 分鐘無日誌！`);

        } else if (gapMs > 5 * 60000 && !_gapAlertSent) {
            _gapAlertSent = true;  // ← 修正：防止每 60s 重複觸發 WARN
            _addThreat(15);
            const warnEntry = {
                t: Date.now(), lv: LEVEL.WARN,
                cat: CAT.SECURITY,
                msg: `⚠️ 日誌斷層警告：已 ${gapMin} 分鐘無日誌活動（閾值：5 分鐘）`,
                ip: _clientIp || '?', user: _currentUser(), ua: navigator.userAgent.slice(0, 60)
            };
            _logs.security.unshift(warnEntry);
            const dk = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            _fbPatch(`/sys_logs/${dk}/${Date.now()}_gapwarn`, warnEntry);
            _updateLight();
            _updateMonitorLive(CAT.SECURITY, warnEntry);
            console.warn(`[🛡 FW] ⚠️ 日誌斷層警告：${gapMin} 分鐘無日誌`);
        }
    }, 60000);

    // ════════════════════════════════════════════════════════
    //  § 6  防火牆 L1 — 輸入驗證
    // ════════════════════════════════════════════════════════
    function validateInput(type, value) {
        if (typeof value !== 'string') value = String(value ?? '');

        // ① 掃描原始輸入
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

        // ② P2：URL 解碼後再掃描（防止 %3Cscript%3E 等編碼繞過）
        try {
            const urlDecoded = decodeURIComponent(value);
            if (urlDecoded !== value) {
                for (const { n, re } of _ATTACK_PATS) {
                    if (re.test(urlDecoded)) {
                        _layerStatus.L1 = 'error';
                        const msg = `${type} 欄位偵測到 URL 編碼繞過攻擊 ${n}（原始: ${value.slice(0, 40)}）`;
                        logIntrusion(`L1 攔截 — ${msg}`);
                        _log(LEVEL.CRITICAL, CAT.L1, msg, true);
                        _addThreat(40);
                        return { valid: false, threat: `ENCODED_${n}`, msg: '偵測到非法輸入，已記錄並通報管理員' };
                    }
                }
            }
        } catch { /* decodeURIComponent 失敗代表格式本身異常，允許通過 */ }

        // ③ P2：CRLF 注入偵測（聊天以外的欄位不允許換行）
        if (type !== 'chat' && /[\r\n]/.test(value)) {
            _layerStatus.L1 = 'error';
            const msg = `${type} 欄位偵測到 CRLF 注入`;
            logIntrusion(`L1 攔截 — ${msg}`);
            _log(LEVEL.CRITICAL, CAT.L1, msg, true);
            _addThreat(30);
            return { valid: false, threat: 'CRLF', msg: '偵測到非法輸入，已記錄並通報管理員' };
        }

        switch (type) {
            case 'username': if (!/^[a-z0-9_]{3,20}$/.test(value))       return { valid: false, msg: '帳號格式不符' };              break;
            case 'email':    if (!value.includes('@') || value.length > 250) return { valid: false, msg: '信箱格式不符' };            break;
            case 'password': if (value.length < 6 || value.length > 128)  return { valid: false, msg: '密碼長度需 6–128 字元' };     break;
            case 'chat':     if (value.length > 300)                      return { valid: false, msg: '訊息過長（最多 300 字）' };   break;
            case 'roomCode': if (!/^\d{5}$/.test(value))                  return { valid: false, msg: '代碼需為 5 位純數字' };       break;
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

    // 靜默版 L1 驗證：只回傳 true/false，不觸發日誌 / 威脅分數 / 郵件
    // 僅供 runScan() 功能測試使用，不作為正式防護
    function _validateInputSilent(type, value) {
        if (typeof value !== 'string') value = String(value ?? '');
        for (const { re } of _ATTACK_PATS) { if (re.test(value)) return false; }
        try {
            const dec = decodeURIComponent(value);
            if (dec !== value) { for (const { re } of _ATTACK_PATS) { if (re.test(dec)) return false; } }
        } catch {}
        if (type !== 'chat' && /[\r\n]/.test(value)) return false;
        return true;
    }

    // ════════════════════════════════════════════════════════
    //  § 7  防火牆 L2 — 速率限制
    // ════════════════════════════════════════════════════════
    function checkRate(type) {
        const cfg = RATE_CFG[type];
        if (!cfg) return { allowed: true, remaining: 999 };

        const now = Date.now();

        // ── P1 記憶體層：清除 localStorage 也無法重置 ───────────
        if (!_memRateLimit[type]) _memRateLimit[type] = { count: 0, w: now };
        const mem = _memRateLimit[type];
        if (now - mem.w > cfg.ms) { mem.count = 0; mem.w = now; }
        mem.count++;

        // ── localStorage 層：跨頁面刷新持久化 ─────────────────
        const key = `fw_rl_${type}`;
        let d;
        try { d = JSON.parse(localStorage.getItem(key) || 'null'); } catch { d = null; }
        if (!d || now - d.w > cfg.ms) d = { count: 0, w: now };
        d.count++;
        try { localStorage.setItem(key, JSON.stringify(d)); } catch {}

        // ── 取兩者較高計數（更嚴格，清 localStorage 也無效）────
        const effectiveCount = Math.max(mem.count, d.count);
        const allowed = effectiveCount <= cfg.max;

        if (!allowed) {
            _layerStatus.L2 = 'warn';
            _log(LEVEL.WARN, CAT.L2,
                `${cfg.label} 速率超限（${effectiveCount}/${cfg.max}，記憶體:${mem.count} 本地:${d.count}）`);
            _addThreat(10);
            if (effectiveCount >= cfg.max * 2) {
                _layerStatus.L2 = 'error';
                logIntrusion(`L2 速率嚴重超限 — ${cfg.label}: ${effectiveCount}/${cfg.max}`);
            }
        } else if (_layerStatus.L2 === 'error') {
            _layerStatus.L2 = 'warn';
        }
        return { allowed, remaining: Math.max(0, cfg.max - effectiveCount), count: effectiveCount, max: cfg.max };
    }

    // ════════════════════════════════════════════════════════
    //  § 8  防火牆 L3 — 行為分析
    // ════════════════════════════════════════════════════════

    // P2：無頭瀏覽器 / 自動化工具偵測（在 init() 呼叫一次）
    function _detectHeadless() {
        const checks = [
            ['webdriver',    () => navigator.webdriver === true],
            ['phantom',      () => !!(window.phantom || window._phantom)],
            ['nightmare',    () => !!window.__nightmare],
            ['headlessUA',   () => /HeadlessChrome|PhantomJS/i.test(navigator.userAgent)],
            ['noPlugins',    () => navigator.plugins?.length === 0 && !navigator.userAgent.includes('Firefox')],
            ['noLanguages',  () => !navigator.languages || navigator.languages.length === 0],
        ];
        const hit = checks.filter(([, fn]) => { try { return fn(); } catch { return false; } });
        if (hit.length >= 2) {
            _layerStatus.L3 = 'error';
            _l3Healthy = false;
            const features = hit.map(([n]) => n).join(', ');
            logIntrusion(`L3 偵測到無頭瀏覽器/自動化工具（${hit.length} 項特徵：${features}）`);
            _addThreat(45);
        } else if (hit.length === 1) {
            _layerStatus.L3 = 'warn';
            _log(LEVEL.WARN, CAT.L3, `L3 可疑自動化特徵：${hit[0][0]}`);
            _addThreat(15);
        }
    }

    function trackBehavior(action) {
        const now = Date.now();
        if (!_behaviorTrack[action]) _behaviorTrack[action] = [];
        const ts = _behaviorTrack[action];
        ts.push(now);

        const cutoff = now - 60000;
        while (ts.length && ts[0] < cutoff) ts.shift();

        if (ts.length > 30) {
            _layerStatus.L3 = 'warn';
            _log(LEVEL.WARN, CAT.L3, `行為異常：${action} 1 分鐘內出現 ${ts.length} 次`);
            _addThreat(8);
            _l3Healthy = false;
        }
        if (ts.length > 60) {
            _layerStatus.L3 = 'error';
            logIntrusion(`L3 偵測到機器人攻擊 — ${action}: ${ts.length} 次/分鐘`);
        }
        if (ts.length >= 3) {
            const last3 = ts.slice(-3);
            const avgInterval = (last3[2] - last3[0]) / 2;
            if (avgInterval < 100) {
                _log(LEVEL.WARN, CAT.L3, `L3 自動化行為 — ${action} 平均間隔 ${Math.round(avgInterval)}ms`);
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
                if (data.wins !== undefined && (data.wins < 0 || data.wins > 99999)) {
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
            logIntrusion(`L5 會話完整性失敗 — 可能遭會話劫持（預期：${_sessionFp}）`);
            _addThreat(40);
        }
        return ok;
    }

    setInterval(() => { if (_sessionFp) validateSession(); }, 30000);

    // 每 30s 定期廣播狀態（心跳，保持 Monitor APP 資料新鮮）
    setInterval(() => { if (_initialized) _broadcastState(); }, 30000);

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

        clearTimeout(_triggerIntrusionAlert._timer);
        _triggerIntrusionAlert._timer = setTimeout(() => {
            overlay.classList.add('hidden');
        }, 15000);

        _status = 'red';
        _updateLight();
        const cntEl = document.getElementById('mon-intrusion-cnt');
        if (cntEl) { cntEl.textContent = _intrusionCnt; cntEl.style.color = '#ff4444'; }
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
        _log(LEVEL.INFO, CAT.SCAN, '▶ 開始模塊完整性掃描...');
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
                    _log(LEVEL.WARN, CAT.SCAN, `掃描異常：${chk.label} — ${detail}`); // 不發 email，交由總結處理
                }
            } catch (e) {
                status  = 'error';
                detail  = e.message?.slice(0, 50) || '例外錯誤';
                allOk   = false;
                _log(LEVEL.WARN, CAT.SCAN, `掃描例外：${chk.label} — ${detail}`);
            }
            results.push({ id: chk.id, label: chk.label, status, detail });
        }

        // 先寫入再讀取，確保路徑存在（Firebase 對不存在路徑的 GET 可能回傳非 200）
        await _fbPatch('/sys_ping', { t: Date.now() });
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
        const okCnt  = results.filter(r => r.status === 'ok').length;
        const errCnt = results.filter(r => r.status === 'error').length;
        _log(LEVEL.INFO, CAT.SCAN, `掃描完成：${okCnt}/${results.length} 項正常${errCnt ? `，${errCnt} 項異常` : '，全部通過'}`);

        if (!allOk) {
            // 只有 3 個以上模塊異常才視為入侵（避免 Auth/DOM 暫時未就緒誤報）
            if (errCnt >= 3) {
                logIntrusion(`掃描發現 ${errCnt} 個模塊嚴重異常，可能遭入侵或被竄改`);
            } else {
                _log(LEVEL.WARN, CAT.SCAN, `掃描發現 ${errCnt} 個模塊異常（可能為初始化未完成，不影響防護）`);
                // 1~2 項輕微異常不加威脅分數，避免干擾綠燈狀態
            }
        }
        return results;
    }

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
    window._openSecurityMonitor = function () {
        const modal = document.getElementById('security-monitor');
        if (!modal) return;
        modal.classList.remove('hidden');
        _monTab    = 'security';
        _logFilter = 'all';
        _renderMonitor();
    };
    window._openSecurityDashboard = window._openSecurityMonitor;

    window._closeSecurityMonitor = function () {
        const modal = document.getElementById('security-monitor');
        if (modal) modal.classList.add('hidden');
    };
    window._closeSecurityDashboard = window._closeSecurityMonitor;

    window._monTab = function (tab) { _monTab = tab; _renderMonitor(); };

    window._monLogFilter = function (f) { _logFilter = f; _renderMonTabContent(); };

    window._monRefresh = async function () {
        const btn = document.getElementById('mon-refresh-btn');
        if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
        try {
            const remote = await getRemoteLogs(1);
            remote.forEach(e => {
                const b = _logs[e.cat] || _logs.security;
                if (!b.some(l => l.t === e.t)) b.unshift(e);
            });
            Object.values(_logs).forEach(arr => arr.splice(200));
            _renderMonitor();
        } finally {
            if (btn) { btn.textContent = '🔄'; btn.disabled = false; }
        }
    };

    window._runScanBtn = async function () {
        const btn = document.getElementById('mon-scan-btn');
        if (btn) { btn.textContent = '⏳ 掃描中…'; btn.disabled = true; }
        try { await runScan(); _renderMonitor(); }
        finally { if (btn) { btn.textContent = '▶ 立即掃描'; btn.disabled = false; } }
    };

    window._monTestAlert = function () {
        const btn = document.getElementById('mon-test-email-btn');
        if (btn) { btn.textContent = '⏳…'; btn.disabled = true; }
        _sendEmail('📧 測試告警', `防火牆運作正常，這是一封測試郵件。\nIP：${_clientIp || '?'}\n時間：${_ts()}`);
        _log(LEVEL.INFO, CAT.SECURITY, '管理員發送了測試警報郵件');
        setTimeout(() => {
            if (btn) { btn.textContent = '✅ 已發送'; setTimeout(() => { if (btn) { btn.textContent = '📧 發送測試郵件'; btn.disabled = false; } }, 2000); }
        }, 1000);
    };

    // ── 主渲染 ───────────────────────────────────────────────
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
            thr.innerHTML = `<span style="color:${C}">${_threatScore}</span><span style="color:#3a7a5a;font-size:10px;">/100</span>`;
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
            { id: 'auth',  label: 'Auth 模塊',   status: (typeof Auth !== 'undefined' || (_startTime > 0 && Date.now() - _startTime < 20000)) ? 'ok' : 'error' },
            { id: 'db',    label: 'Firebase',     status: _fbReachable ? 'ok' : 'error'                       },
            { id: 'email', label: '監控郵件',     status: typeof emailjs !== 'undefined' ? 'ok' : 'warn'      },
            { id: 'gap',   label: '日誌連續性',   status: (Date.now() - _lastLogTime) > 10 * 60000 ? 'error' : (Date.now() - _lastLogTime) > 5 * 60000 ? 'warn' : 'ok' },
        ];
        const C  = { ok: '#00ff88', warn: '#ffcc00', error: '#ff4444' };
        const T  = { ok: '正常',    warn: '警告',    error: '異常'    };
        const BG = { ok: 'rgba(0,255,136,0.06)', warn: 'rgba(255,204,0,0.06)', error: 'rgba(255,68,68,0.08)' };
        const BD = { ok: 'rgba(0,255,136,0.18)', warn: 'rgba(255,204,0,0.18)', error: 'rgba(255,68,68,0.25)' };
        el.innerHTML = layers.map(l => `
            <div style="background:${BG[l.status]};border:1px solid ${BD[l.status]};border-radius:7px;padding:7px 9px;display:flex;align-items:center;gap:6px;min-width:0;">
                <div style="width:7px;height:7px;border-radius:50%;flex-shrink:0;background:${C[l.status]};box-shadow:0 0 5px ${C[l.status]};"></div>
                <div style="min-width:0;">
                    <div style="color:${C[l.status]};font-size:10px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${l.label}</div>
                    <div style="color:#3a7a5a;font-size:9px;">${T[l.status]}</div>
                </div>
            </div>`).join('');
    }

    const _TAB_CFG = [
        { id: 'security',  label: '🔒 安全日誌'  },
        { id: 'intrusion', label: '🚨 入侵日誌'  },
        { id: 'db_access', label: '🗃 DB 訪問'   },
        { id: 'error',     label: '❌ 系統錯誤'  },
        { id: 'ops',       label: '📌 操作記錄'  },
        { id: 'scan',      label: '🔍 系統檢測'  },
    ];

    function _renderTabBar() {
        const el = document.getElementById('mon-tab-bar');
        if (!el) return;
        el.innerHTML = _TAB_CFG.map(t => {
            const isOn = t.id === _monTab;
            const cnt  = t.id !== 'scan' ? (_logs[t.id] || []).length : (_lastScanResults.length || '');
            const badge = cnt ? `<span style="background:${isOn ? 'rgba(0,255,136,0.2)' : 'rgba(255,255,255,0.06)'};padding:1px 5px;border-radius:8px;margin-left:4px;font-size:9px;">${cnt}</span>` : '';
            return `<button onclick="window._monTab('${t.id}')" style="flex-shrink:0;padding:6px 11px;border-radius:6px 6px 0 0;border:1px solid ${isOn ? 'rgba(0,255,136,0.35)' : '#0d2015'};border-bottom:none;background:${isOn ? 'rgba(0,255,136,0.1)' : 'none'};color:${isOn ? '#00ff88' : '#2a5a3a'};font-size:10px;cursor:pointer;font-family:inherit;letter-spacing:0.5px;white-space:nowrap;transition:all .2s;">${t.label}${badge}</button>`;
        }).join('');
    }

    function _renderMonTabContent() {
        const el = document.getElementById('mon-tab-content');
        if (!el) return;
        if (_monTab === 'scan') { _renderScanPanel(el); return; }

        const showFilter = (_monTab === 'security' || _monTab === 'error');

        let html = '';
        if (showFilter) {
            html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:6px;flex-wrap:wrap;">
                <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    ${['all', 'critical', 'warn', 'info'].map(f => {
                        const isOn = _logFilter === f;
                        const label = { all: '全部', critical: '🚨危急', warn: '⚠️警告', info: 'ℹ️資訊' }[f];
                        return `<button onclick="window._monLogFilter('${f}')" id="mfilter-${f}" style="background:${isOn ? 'rgba(0,255,136,0.14)' : 'none'};border:1px solid ${isOn ? 'rgba(0,255,136,0.38)' : '#0d2015'};color:${isOn ? '#00ff88' : '#2a5a3a'};padding:3px 9px;border-radius:4px;font-size:10px;cursor:pointer;font-family:inherit;transition:all .2s;">${label}</button>`;
                    }).join('')}
                </div>
                <button id="mon-refresh-btn" onclick="window._monRefresh()" style="background:none;border:1px solid #0d2015;color:#2a5a3a;padding:3px 10px;border-radius:4px;font-size:10px;cursor:pointer;font-family:inherit;" onmouseover="this.style.color='#00ff88'" onmouseout="this.style.color='#2a5a3a'">🔄</button>
            </div>`;
        } else {
            html += `<div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
                <button id="mon-refresh-btn" onclick="window._monRefresh()" style="background:none;border:1px solid #0d2015;color:#2a5a3a;padding:3px 10px;border-radius:4px;font-size:10px;cursor:pointer;font-family:inherit;" onmouseover="this.style.color='#00ff88'" onmouseout="this.style.color='#2a5a3a'">🔄 刷新</button>
            </div>`;
        }

        let list = _logs[_monTab] || [];
        if (showFilter && _logFilter !== 'all') {
            list = list.filter(e => e.lv === _logFilter);
        }

        if (list.length === 0) {
            html += `<div style="color:#2a6a4a;text-align:center;padding:32px 0;font-size:12px;">── 暫無記錄 ──</div>`;
        } else {
            const BG  = { info: 'rgba(0,255,136,0.03)',  warn: 'rgba(255,204,0,0.04)',  critical: 'rgba(255,68,68,0.06)' };
            const BD  = { info: 'rgba(0,255,136,0.09)',  warn: 'rgba(255,204,0,0.12)',  critical: 'rgba(255,68,68,0.20)' };
            const COL = { info: '#3a8a5a',               warn: '#9a8830',               critical: '#9a3030'              };
            const IC  = { info: 'ℹ️',                    warn: '⚠️',                    critical: '🚨'                   };

            html += list.slice(0, 150).map(e => {
                const dt   = new Date(e.t);
                // 完整時間戳：月/日 時:分:秒
                const ts   = dt.toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const lv   = e.lv || 'info';
                const ipEl   = (e.ip   && e.ip   !== '?' && e.ip   !== '無法取得') ? `<span style="color:#5aaa7a;"> ｜ 🌐 ${e.ip}</span>`     : '';
                const userEl = (e.user && e.user !== '未登入' && e.user !== '?')   ? `<span style="color:#7acc9a;"> ｜ 👤 ${e.user}</span>` : '';
                return `<div style="background:${BG[lv]||BG.info};border:1px solid ${BD[lv]||BD.info};border-radius:6px;padding:8px 10px;font-size:11px;line-height:1.5;margin-bottom:4px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;flex-wrap:wrap;gap:4px;">
                        <span style="color:${COL[lv]||COL.info};font-weight:700;font-size:11px;">${IC[lv]||'📝'} ${e.cat || ''}</span>
                        <span style="color:#6ab88a;font-size:10px;font-family:monospace;letter-spacing:0.5px;">🕐 ${ts}</span>
                    </div>
                    <div style="color:#7aaa8a;font-size:12px;margin-bottom:${(ipEl||userEl)?'3':'0'}px;">${e.msg}</div>
                    ${(ipEl || userEl) ? `<div style="font-size:9px;margin-top:2px;">${ipEl}${userEl}</div>` : ''}
                </div>`;
            }).join('');
        }
        el.innerHTML = html;
    }

    function _renderScanPanel(el) {
        const scanTime = _lastScanTime
            ? '上次掃描：' + new Date(_lastScanTime).toLocaleString('zh-TW', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' })
            : '尚未執行掃描';

        let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <div style="color:#4a8a6a;font-size:10px;letter-spacing:1px;">🕐 ${scanTime}</div>
            <button id="mon-scan-btn" onclick="window._runScanBtn()" style="background:linear-gradient(135deg,#041a0a,#072010);border:1px solid rgba(0,255,136,0.25);color:#00ff88;padding:5px 14px;border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit;letter-spacing:1px;transition:all .2s;" onmouseover="this.style.borderColor='rgba(0,255,136,0.55)'" onmouseout="this.style.borderColor='rgba(0,255,136,0.25)'">▶ 立即掃描</button>
        </div>`;

        if (_lastScanResults.length === 0) {
            html += `<div style="color:#2a6a4a;text-align:center;padding:32px 0;font-size:12px;">── 點擊「立即掃描」開始系統檢測 ──</div>`;
        } else {
            const ok  = _lastScanResults.filter(r => r.status === 'ok').length;
            const err = _lastScanResults.filter(r => r.status === 'error').length;
            const C   = err > 0 ? '#ff4444' : ok === _lastScanResults.length ? '#00ff88' : '#ffcc00';
            html += `<div style="text-align:center;margin-bottom:12px;padding:10px;background:rgba(0,0,0,0.3);border-radius:8px;border:1px solid ${C}44;">
                <span style="color:${C};font-size:16px;font-weight:900;">${ok}/${_lastScanResults.length}</span>
                <span style="color:#4a8a6a;font-size:11px;margin-left:6px;">項目正常</span>
                ${err > 0 ? `<span style="color:#ff4444;font-size:11px;margin-left:10px;">⚠ ${err} 項異常</span>` : '<span style="color:#00ff88;font-size:11px;margin-left:10px;">✓ 全部通過</span>'}
            </div>`;
            html += _lastScanResults.map(r => {
                const C2  = { ok: '#00ff88', warn: '#ffcc00', error: '#ff4444' }[r.status];
                const BG2 = { ok: 'rgba(0,255,136,0.04)', warn: 'rgba(255,204,0,0.04)', error: 'rgba(255,68,68,0.07)' }[r.status];
                const IC2 = { ok: '✓', warn: '⚠', error: '✗' }[r.status];
                return `<div style="background:${BG2};border:1px solid ${C2}22;border-radius:6px;padding:8px 12px;display:flex;align-items:center;gap:10px;margin-bottom:4px;">
                    <div style="font-size:14px;color:${C2};flex-shrink:0;font-weight:900;">${IC2}</div>
                    <div style="flex:1;min-width:0;">
                        <div style="color:${C2};font-size:11px;font-weight:700;">${r.label}</div>
                        <div style="color:#4a8a6a;font-size:10px;margin-top:1px;">${r.detail}</div>
                    </div>
                </div>`;
            }).join('');
        }

        html += `<div style="margin-top:14px;padding-top:12px;border-top:1px solid #0a1c0f;">
            <div style="font-size:10px;color:#3a7a5a;letter-spacing:1px;margin-bottom:8px;">── 監控郵件設定 ──</div>
            <div style="background:#041208;border:1px solid #0a1c0f;border-radius:8px;padding:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #0a1c0f;margin-bottom:6px;">
                    <span style="color:#4a8a6a;font-size:11px;">收件人</span>
                    <span style="color:#00ff88;font-size:11px;font-weight:700;">linus622wang@gmail.com</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;margin-bottom:10px;">
                    <span style="color:#4a8a6a;font-size:11px;">觸發等級</span>
                    <span style="color:#ffcc00;font-size:11px;font-weight:700;">CRITICAL（自動）</span>
                </div>
                <button id="mon-test-email-btn" onclick="window._monTestAlert()" style="width:100%;background:#041a0a;border:1px solid rgba(0,255,136,0.18);color:#00ff88;padding:8px;border-radius:6px;font-size:11px;font-family:inherit;cursor:pointer;letter-spacing:1px;transition:all .2s;" onmouseover="this.style.borderColor='rgba(0,255,136,0.45)'" onmouseout="this.style.borderColor='rgba(0,255,136,0.18)'">📧 發送測試告警郵件</button>
            </div>
        </div>`;
        el.innerHTML = html;
    }

    function _updateMonitorLive(category, entry) {
        const modal = document.getElementById('security-monitor');
        if (!modal || modal.classList.contains('hidden')) return;
        _renderMonHeader();
        if (_monTab === category || (_monTab === 'security' && !['db_access', 'ops', 'scan', 'intrusion', 'error'].includes(category))) {
            _renderMonTabContent();
        }
        _renderTabBar();
    }

    // ════════════════════════════════════════════════════════
    //  § 17  初始化
    // ════════════════════════════════════════════════════════
    function init() {
        if (_initialized) { _updateLight(); return; }
        _initialized = true;
        _startTime   = Date.now(); // 在 init() 設定，確保掃描寬限期計算正確

        _resolveIp().then(ip => {
            _checkIpBlacklist(); // IP 黑名單檢查
            const now = new Date().toLocaleString('zh-TW');
            _log(LEVEL.INFO, CAT.SYSTEM, `🛡 防火牆安全系統啟動 v20260531a`);
            _log(LEVEL.INFO, CAT.SYSTEM, `客戶端 IP：${ip} ｜ 啟動時間：${now}`);
            _log(LEVEL.INFO, CAT.SYSTEM, `防火牆層級：L1(+URL解碼/CRLF) · L2(記憶體雙鎖) · L3(無頭偵測) · L4 資料完整性 · L5 會話驗證`);
            _log(LEVEL.INFO, CAT.OPS,    `瀏覽器資訊：${navigator.userAgent.slice(0, 80)}`);
            const ipEl = document.getElementById('mon-ip-display');
            if (ipEl) ipEl.textContent = ip;
            setTimeout(() => _broadcastState(), 2000); // IP 取得後廣播初始狀態
        });

        // P2：無頭瀏覽器偵測（啟動後 500ms 執行，等 DOM 穩定）
        setTimeout(() => _detectHeadless(), 500);

        _updateLight();

        window.addEventListener('error', e => {
            logError(e.message || '未知錯誤', e.filename ? `${e.filename}:${e.lineno}` : '');
        });

        window.addEventListener('unhandledrejection', e => {
            logError(`UnhandledPromise: ${String(e.reason).slice(0, 80)}`);
        });

        setTimeout(() => runScan(), 8000); // 8s 後掃描，讓 auth.js 有足夠時間載入
    }

    // ════════════════════════════════════════════════════════
    //  § 18  Public API
    // ════════════════════════════════════════════════════════
    window.HuaXiaSecurity = {
        LEVEL, CAT,
        init,
        validateInput,       // L1
        checkRate,           // L2
        trackBehavior,       // L3
        validateCoreData,    // L4
        validateSession,     // L5
        bindSession,
        recordEvent,
        logDbAccess,
        logOps,
        logError,
        logIntrusion,
        recordFailedLogin,
        recordSuccessLogin,
        isLoginBlocked,
        getBlockRemaining,
        getStatus,
        getThreatScore,
        onStatusChange,
        getLocalLogs,
        getRemoteLogs,
        runScan,
        checkIpBlacklist: _checkIpBlacklist,  // IP 封鎖
    };
})();
