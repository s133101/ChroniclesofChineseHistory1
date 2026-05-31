// ============================================================
//  華夏風雲錄 — protect.js
//  Copyright © 2026 linus622wang@gmail.com  All Rights Reserved.
//  程式碼保護層：未經授權禁止查看或修改
// ============================================================
(function _protect() {
    'use strict';

    const OWNER       = 'linus622wang@gmail.com';
    const DEV_KEY     = 'hua_dev_verified';
    const SESSION_KEY = 'hua_dev_session';   // 目前等待中的 session ID

    const EMAILJS_SERVICE_ID  = 'service_ATW5856LINUS';
    const EMAILJS_TEMPLATE_ID = 'template_ATW5856LINUS';
    const EMAILJS_PUBLIC_KEY  = '6pXEpXo8kr54GfzH0';

    // Firebase Realtime Database（REST API，不需 SDK）
    const FIREBASE_URL = 'https://chroniclesofchinesehistory1-default-rtdb.asia-southeast1.firebasedatabase.app/auth_requests';

    // ── 工具函式 ──────────────────────────────────────────────
    function _isVerified() {
        return localStorage.getItem(DEV_KEY) === 'true';
    }

    function _revokeAll() {
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('hua_dev')) toRemove.push(k);
        }
        toRemove.forEach(k => localStorage.removeItem(k));
        localStorage.removeItem(SESSION_KEY);
    }

    function _showSuccessToast(msg) {
        const ok = document.createElement('div');
        ok.style.cssText =
            'position:fixed;top:20px;left:50%;transform:translateX(-50%);' +
            'background:#1a4a1a;border:1px solid #2d7a2d;color:#7fff7f;' +
            'padding:12px 28px;border-radius:8px;z-index:2147483647;' +
            'font-family:"Noto Serif TC",serif;font-size:14px;font-weight:700;' +
            'white-space:nowrap;pointer-events:none;';
        ok.textContent = msg;
        document.body.appendChild(ok);
        setTimeout(() => ok.remove(), 4000);
    }

    // ── Firebase REST 操作 ────────────────────────────────────
    function _fbWrite(sessionId, data) {
        return fetch(FIREBASE_URL + '/' + sessionId + '.json', {
            method:  'PUT',
            headers: {'Content-Type': 'application/json'},
            body:    JSON.stringify(data)
        }).catch(() => {});
    }

    function _fbDelete(sessionId) {
        fetch(FIREBASE_URL + '/' + sessionId + '.json', {method: 'DELETE'}).catch(() => {});
    }

    // ── Firebase SSE 監聽（即時推播）────────────────────────
    let _sse = null;
    function _startListening(sessionId) {
        if (_sse) { _sse.close(); _sse = null; }

        _sse = new EventSource(FIREBASE_URL + '/' + sessionId + '.json');

        _sse.addEventListener('put', function(e) {
            try {
                const d = JSON.parse(e.data);
                if (!d || !d.data) return;
                const status = d.data.status;

                if (status === 'granted') {
                    _sse.close(); _sse = null;
                    localStorage.setItem(DEV_KEY, 'true');
                    localStorage.removeItem(SESSION_KEY);
                    _fbDelete(sessionId);
                    const aw = document.getElementById('_ask_wall');
                    if (aw) aw.remove();
                    _showSuccessToast('✅ 開發者身份已由信箱確認，已授予完整存取權限');

                } else if (status === 'revoked') {
                    _sse.close(); _sse = null;
                    _revokeAll();
                    _fbDelete(sessionId);
                    _hardLock();
                }
            } catch(err) {}
        });

        _sse.onerror = function() {
            // SSE 中斷時靜默重連（瀏覽器會自動重試）
        };
    }

    // ── 完全鎖定模式 ──────────────────────────────────────────
    function _hardLock() {
        const aw = document.getElementById('_ask_wall');
        if (aw) aw.remove();
        if (document.getElementById('_pwall')) return;

        const wall = document.createElement('div');
        wall.id = '_pwall';
        wall.style.cssText = [
            'position:fixed','inset:0','z-index:2147483647',
            'background:rgba(0,0,0,0.98)',
            'display:flex','flex-direction:column',
            'align-items:center','justify-content:center',
            'font-family:"Noto Serif TC",serif',
            'color:#d4af37','text-align:center','padding:40px',
            'backdrop-filter:blur(12px)'
        ].join(';');

        wall.innerHTML = `
            <div style="font-size:72px;margin-bottom:20px;">🔒</div>
            <div style="font-size:24px;font-weight:900;letter-spacing:4px;color:#fff;margin-bottom:8px;">
                保護模式已啟動
            </div>
            <div style="font-size:13px;color:#888;letter-spacing:2px;margin-bottom:28px;">
                PROTECTION MODE ACTIVE
            </div>
            <div style="
                background:rgba(212,175,55,0.07);
                border:1px solid rgba(212,175,55,0.25);
                border-radius:14px;padding:28px 36px;
                max-width:500px;line-height:2;
            ">
                <div style="font-size:15px;color:#eee;margin-bottom:10px;">
                    本程式碼僅供開發者本人使用
                </div>
                <div style="font-size:13px;color:#aaa;margin-bottom:18px;">
                    查看或修改程式碼需獲得開發者書面授權<br>
                    Viewing or modifying source code requires<br>
                    written permission from the developer.
                </div>
                <a href="mailto:${OWNER}?subject=華夏風雲錄程式碼授權申請&body=您好，我希望申請查看%2F修改華夏風雲錄程式碼的授權。%0A%0A姓名：%0A用途：%0A"
                   style="
                       display:inline-block;
                       background:linear-gradient(135deg,#b8860b,#d4af37);
                       color:#000;font-weight:900;padding:12px 32px;
                       border-radius:8px;text-decoration:none;
                       font-size:14px;letter-spacing:1px;
                   ">
                    📧 向開發者申請授權
                </a>
                <div style="font-size:11px;color:#444;margin-top:18px;">${OWNER}</div>
            </div>
            <div style="font-size:11px;color:#333;margin-top:20px;">
                © 2026 ${OWNER} · All Rights Reserved
            </div>
        `;
        document.body.appendChild(wall);
        document.addEventListener('keydown', e => e.preventDefault(), true);
    }

    // ── 處理信件連結（?dev_grant / ?dev_revoke）──────────────
    function _checkUrlCallback() {
        const params      = new URLSearchParams(window.location.search);
        const grantId     = params.get('dev_grant');
        const revokeId    = params.get('dev_revoke');
        if (!grantId && !revokeId) return;

        history.replaceState({}, '', window.location.pathname);

        const _showPage = (icon, color, title) => {
            const run = () => {
                document.body.innerHTML = `
                    <div style="
                        position:fixed;inset:0;background:#0a0a0a;
                        display:flex;flex-direction:column;
                        align-items:center;justify-content:center;
                        font-family:'Noto Serif TC',serif;
                        color:${color};text-align:center;
                    ">
                        <div style="font-size:64px;margin-bottom:16px;">${icon}</div>
                        <div style="font-size:20px;font-weight:900;">${title}</div>
                        <div style="font-size:13px;color:#555;margin-top:10px;">此視窗將自動關閉…</div>
                    </div>`;
                setTimeout(() => window.close(), 1800);
            };
            document.readyState === 'loading'
                ? document.addEventListener('DOMContentLoaded', run)
                : run();
        };

        if (grantId) {
            // ✅ 開通：寫入 Firebase + 直接設定 localStorage（同分頁開啟時 SSE 已不存在）
            _fbWrite(grantId, {status: 'granted', time: Date.now()});
            localStorage.setItem(DEV_KEY, 'true');
            localStorage.removeItem(SESSION_KEY);
            _showPage('✅', '#7fff7f', '開發者身份已確認，權限已開通');
            // 1.8s 後：嘗試關分頁；若關不掉（同分頁）立即跳回遊戲
            setTimeout(() => { window.close(); window.location.replace(window.location.pathname); }, 1800);
            return;
        }

        if (revokeId) {
            // ❌ 拒絕：寫入 Firebase + 清除本地驗證狀態
            _fbWrite(revokeId, {status: 'revoked', time: Date.now()});
            _revokeAll();
            _showPage('🔒', '#ff8888', '已拒絕並撤銷所有權限');
            setTimeout(() => { window.close(); window.location.replace(window.location.pathname); }, 1800);
            return;
        }
    }

    // ── 身份確認視窗 ──────────────────────────────────────────
    function _askIdentity(reason) {
        if (_isVerified()) return;
        if (document.getElementById('_ask_wall')) return;
        if (document.getElementById('_pwall'))    return;

        const wall = document.createElement('div');
        wall.id = '_ask_wall';
        wall.style.cssText = [
            'position:fixed','inset:0','z-index:2147483647',
            'background:rgba(0,0,0,0.96)',
            'display:flex','flex-direction:column',
            'align-items:center','justify-content:center',
            'font-family:"Noto Serif TC",serif',
            'color:#d4af37','text-align:center','padding:40px',
            'backdrop-filter:blur(10px)'
        ].join(';');

        wall.innerHTML = `
            <div style="font-size:56px;margin-bottom:20px;">🔑</div>
            <div style="font-size:20px;font-weight:900;letter-spacing:3px;color:#fff;margin-bottom:6px;">
                身份確認
            </div>
            <div style="font-size:12px;color:#666;letter-spacing:2px;margin-bottom:28px;">
                IDENTITY VERIFICATION
            </div>
            <div style="
                background:rgba(212,175,55,0.07);
                border:1px solid rgba(212,175,55,0.2);
                border-radius:14px;padding:28px 36px;
                max-width:480px;line-height:1.8;
            ">
                <div style="font-size:15px;color:#eee;margin-bottom:6px;">
                    您是本程式的開發者嗎？
                </div>
                <div style="font-size:12px;color:#666;margin-bottom:20px;">
                    Are you the developer of this application?
                </div>
                <div style="
                    background:rgba(255,255,255,0.04);
                    border:1px solid #222;border-radius:8px;
                    padding:10px 16px;margin-bottom:20px;
                    font-size:13px;color:#888;
                ">
                    開發者：<span style="color:#d4af37;">${OWNER}</span>
                </div>
                <div id="_ask_hint" style="
                    font-size:12px;color:#666;margin-bottom:20px;min-height:18px;
                ">點「是」後將傳送驗證信，請至信箱確認</div>

                <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;">
                    <button id="_btn_yes" style="
                        background:linear-gradient(135deg,#1a4a1a,#2d7a2d);
                        color:#7fff7f;border:1px solid #2d7a2d;
                        padding:12px 28px;border-radius:8px;
                        font-size:14px;font-weight:900;cursor:pointer;
                        font-family:'Noto Serif TC',serif;letter-spacing:1px;
                        min-width:160px;transition:opacity .2s;
                    ">✅ 是，我是開發者</button>
                    <button id="_btn_no" style="
                        background:rgba(120,0,0,0.4);
                        color:#ff8888;border:1px solid #5a0000;
                        padding:12px 28px;border-radius:8px;
                        font-size:14px;font-weight:900;cursor:pointer;
                        font-family:'Noto Serif TC',serif;letter-spacing:1px;
                        min-width:160px;transition:opacity .2s;
                    ">❌ 否，我不是</button>
                </div>
            </div>
        `;
        document.body.appendChild(wall);

        // ── 按「是」→ 寄信 + Firebase 監聽 ───────────────────
        document.getElementById('_btn_yes').onclick = function() {
            const btnYes = this;
            const btnNo  = document.getElementById('_btn_no');
            const hint   = document.getElementById('_ask_hint');
            btnYes.disabled = true;
            btnNo.disabled  = true;
            btnYes.style.opacity = '0.6';
            btnNo.style.opacity  = '0.4';
            btnYes.textContent = '⏳ 傳送中...';

            // C-6 Fix：改用 crypto.getRandomValues，提升 session ID 的熵
            const _arr = new Uint8Array(16);
            crypto.getRandomValues(_arr);
            const sessionId = Array.from(_arr).map(b => b.toString(16).padStart(2,'0')).join('');
            localStorage.setItem(SESSION_KEY, sessionId);

            const baseUrl    = window.location.origin + window.location.pathname;
            const grantUrl   = baseUrl + '?dev_grant='  + sessionId;
            const revokeUrl  = baseUrl + '?dev_revoke=' + sessionId;

            // 寫入 Firebase（pending 狀態）
            _fbWrite(sessionId, {
                status:     'pending',
                time:       Date.now(),
                user_agent: navigator.userAgent
            }).then(() => {
                // 開始監聽 Firebase 狀態變化
                _startListening(sessionId);
            });

            // ── 備援輪詢：每秒檢查 localStorage，另一分頁點連結後自動解鎖 ──
            const _poll = setInterval(() => {
                if (_isVerified()) {
                    clearInterval(_poll);
                    const aw = document.getElementById('_ask_wall');
                    if (aw) aw.remove();
                    _showSuccessToast('✅ 開發者身份已確認，已授予完整存取權限');
                }
            }, 1000);

            // ── 傳送驗證信（EmailJS，action 欄位帶連結，Gmail 自動超連結）──
            if (typeof emailjs === 'undefined') {
                btnYes.textContent = '❌ 郵件模組未載入';
                hint.textContent   = '請確認網路連線後重試';
                hint.style.color   = '#ff8888';
                return;
            }

            emailjs.send(
                EMAILJS_SERVICE_ID,
                EMAILJS_TEMPLATE_ID,
                {
                    event_time: new Date().toLocaleString('zh-TW'),
                    user_agent: navigator.userAgent,
                    grant_url:  grantUrl,
                    revoke_url: revokeUrl
                },
                EMAILJS_PUBLIC_KEY
            ).then(() => {
                btnYes.textContent = '📧 驗證信已傳送';
                hint.innerHTML =
                    '請至 <span style="color:#d4af37;">' + OWNER + '</span> 信箱點選確認連結<br>' +
                    '<span style="color:#555;font-size:11px;">等待開發者確認中…</span>';
                hint.style.color = '#aaa';
            }).catch(() => {
                btnYes.textContent = '❌ 傳送失敗，請重試';
                btnYes.disabled    = false;
                btnNo.disabled     = false;
                btnYes.style.opacity = '1';
                btnNo.style.opacity  = '1';
                if (_sse) { _sse.close(); _sse = null; }
                localStorage.removeItem(SESSION_KEY);
                _fbDelete(sessionId);
            });
        };

        // ── 按「否」→ 直接鎖定 ────────────────────────────────
        document.getElementById('_btn_no').onclick = function() {
            clearInterval(_poll);           // L-1 Fix：清除備援輪詢
            if (_sse) { _sse.close(); _sse = null; } // L-9 Fix：關閉 SSE
            _revokeAll();
            _hardLock();
        };
    }

    // ── 跨分頁偵測：另一個分頁點了信件連結後，storage 事件即時通知 ──
    window.addEventListener('storage', function(e) {
        if (e.key === DEV_KEY && e.newValue === 'true') {
            if (_sse) { _sse.close(); _sse = null; }
            const aw = document.getElementById('_ask_wall');
            if (aw) aw.remove();
            _showSuccessToast('✅ 開發者身份已確認，已授予完整存取權限');
        }
    });

    // ── 頁面載入：先處理信件回調 ─────────────────────────────
    _checkUrlCallback();

    // ── 頁面載入：若有未完成的 session，繼續監聽 ────────────
    (function _resumeSession() {
        const sessionId = localStorage.getItem(SESSION_KEY);
        if (sessionId && !_isVerified()) {
            // 短暫延遲等 DOM 就緒
            setTimeout(() => _startListening(sessionId), 500);
        }
    })();

    // ── 禁用右鍵選單 ─────────────────────────────────────────
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        if (!_isVerified()) _askIdentity('contextmenu');
    });

    // ── 攔截鍵盤快捷鍵 ───────────────────────────────────────
    document.addEventListener('keydown', function(e) {
        if (_isVerified()) return;

        const key   = e.key;
        const ctrl  = e.ctrlKey || e.metaKey;
        const shift = e.shiftKey;

        if (key === 'F12') {
            e.preventDefault(); _askIdentity('F12'); return;
        }
        if (ctrl && shift && ['I','i','J','j','C','c'].includes(key)) {
            e.preventDefault(); _askIdentity('devtools-key'); return;
        }
        if (ctrl && ['U','u'].includes(key)) {
            e.preventDefault(); _askIdentity('view-source'); return;
        }
        if (ctrl && ['S','s'].includes(key)) {
            e.preventDefault(); return;
        }
    }, true);

    // ── DevTools 視窗尺寸偵測 ────────────────────────────────
    let _devOpen = false;
    const _devSizeTimer = setInterval(() => {
        if (_isVerified()) { clearInterval(_devSizeTimer); return; }
        const open = (window.outerWidth  - window.innerWidth  > 160) ||
                     (window.outerHeight - window.innerHeight > 160);
        if (open && !_devOpen) { _devOpen = true; _askIdentity('devtools-size'); }
        if (!open)              { _devOpen = false; }
    }, 1000);
    // M-1 Fix：頁面卸載時清除 interval
    window.addEventListener('beforeunload', () => clearInterval(_devSizeTimer));

    // ── Console 水印 ─────────────────────────────────────────
    const _origCE  = console.error.bind(console);
    const _origLog = console.log.bind(console);
    let _warned = false;
    console.log = function(...args) {
        const first = typeof args[0] === 'string' ? args[0] : '';
        if (!_warned && !_isVerified() &&
            !first.includes('%c ╔') && !first.includes('[Network]')) {
            _warned = true;
            _origCE('%c⛔ 未授權 — 請先取得 ' + OWNER + ' 的授權',
                    'color:#ff4444;font-size:14px;font-weight:900;');
        }
        _origLog(...args);
    };

})();
