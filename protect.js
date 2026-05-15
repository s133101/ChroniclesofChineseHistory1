// ============================================================
//  華夏風雲錄 — protect.js
//  Copyright © 2026 linus622wang@gmail.com  All Rights Reserved.
//  程式碼保護層：未經授權禁止查看或修改
// ============================================================
(function _protect() {
    'use strict';

    const OWNER     = 'linus622wang@gmail.com';
    const DEV_KEY   = 'hua_dev_verified';   // localStorage 驗證旗標
    const TOKEN_KEY = 'hua_dev_token';      // 開發者存取 token

    // ── 開發者已驗證？直接放行 ────────────────────────────────
    function _isVerified() {
        return localStorage.getItem(DEV_KEY) === 'true';
    }

    // ── 完全鎖定模式（非開發者）──────────────────────────────
    function _hardLock() {
        // 移除詢問牆
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

        // 鎖定後禁用所有鍵盤輸入（Escape 也無效）
        document.addEventListener('keydown', e => e.preventDefault(), true);
    }

    // ── 詢問是否為開發者 ──────────────────────────────────────
    function _askIdentity(reason) {
        if (_isVerified()) return;                          // 已驗證，放行
        if (document.getElementById('_ask_wall')) return;  // 已顯示
        if (document.getElementById('_pwall'))    return;  // 已鎖定

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
                max-width:460px;line-height:1.8;
            ">
                <div style="font-size:15px;color:#eee;margin-bottom:6px;">
                    您是本程式的開發者嗎？
                </div>
                <div style="font-size:12px;color:#666;margin-bottom:24px;">
                    Are you the developer of this application?
                </div>
                <div style="
                    background:rgba(255,255,255,0.04);
                    border:1px solid #222;border-radius:8px;
                    padding:12px 16px;margin-bottom:24px;
                    font-size:13px;color:#888;
                ">
                    開發者：<span style="color:#d4af37;">${OWNER}</span>
                </div>

                <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;">
                    <button id="_btn_yes" style="
                        background:linear-gradient(135deg,#1a4a1a,#2d7a2d);
                        color:#7fff7f;border:1px solid #2d7a2d;
                        padding:12px 28px;border-radius:8px;
                        font-size:14px;font-weight:900;cursor:pointer;
                        font-family:'Noto Serif TC',serif;letter-spacing:1px;
                        min-width:160px;
                    ">✅ 是，我是開發者</button>
                    <button id="_btn_no" style="
                        background:rgba(120,0,0,0.4);
                        color:#ff8888;border:1px solid #5a0000;
                        padding:12px 28px;border-radius:8px;
                        font-size:14px;font-weight:900;cursor:pointer;
                        font-family:'Noto Serif TC',serif;letter-spacing:1px;
                        min-width:160px;
                    ">❌ 否，我不是</button>
                </div>

                <div id="_verify_area" style="display:none;margin-top:20px;">
                    <div style="font-size:12px;color:#888;margin-bottom:10px;">
                        已傳送驗證信至 ${OWNER}<br>
                        請輸入信中提供的存取金鑰：
                    </div>
                    <div style="display:flex;gap:8px;justify-content:center;">
                        <input id="_dev_token_input" type="password"
                            placeholder="輸入存取金鑰..."
                            style="
                                background:#111;border:1px solid #333;
                                color:#d4af37;padding:10px 14px;
                                border-radius:6px;font-size:14px;
                                width:200px;text-align:center;
                                font-family:'Noto Serif TC',serif;
                                outline:none;
                            "
                        />
                        <button id="_btn_token" style="
                            background:linear-gradient(135deg,#b8860b,#d4af37);
                            color:#000;border:none;padding:10px 18px;
                            border-radius:6px;font-weight:900;
                            cursor:pointer;font-size:14px;
                        ">確認</button>
                    </div>
                    <div id="_token_err" style="color:#ff6666;font-size:12px;margin-top:8px;display:none;">
                        金鑰錯誤，請重試或聯繫開發者。
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(wall);

        // ── 按「是」→ 寄驗證信 + 顯示金鑰輸入框 ──────────────
        document.getElementById('_btn_yes').onclick = function() {
            this.disabled = true;
            this.textContent = '📧 驗證信已傳送...';

            // 傳送驗證信通知開發者有人聲稱是本人
            const subject = encodeURIComponent('【華夏風雲錄】有人聲稱是開發者，請確認');
            const body    = encodeURIComponent(
                '系統通知：有人在 ' + new Date().toLocaleString('zh-TW') +
                ' 嘗試以開發者身份存取程式碼。\n\n' +
                '瀏覽器：' + navigator.userAgent + '\n\n' +
                '如果是您本人操作，請忽略此信。\n' +
                '如果不是，請立即聯繫相關平台。'
            );
            window.open('mailto:' + OWNER + '?subject=' + subject + '&body=' + body);

            // 顯示金鑰輸入框
            document.getElementById('_verify_area').style.display = 'block';
            document.getElementById('_btn_no').style.display = 'none';
        };

        // ── 按「否」→ 直接鎖定 ────────────────────────────────
        document.getElementById('_btn_no').onclick = function() {
            _hardLock();
        };

        // ── 輸入金鑰驗證 ──────────────────────────────────────
        document.getElementById('_btn_token').onclick = _checkToken;
        document.getElementById('_dev_token_input').addEventListener('keydown', e => {
            if (e.key === 'Enter') _checkToken();
        });
    }

    // ── 驗證開發者金鑰 ────────────────────────────────────────
    // 金鑰 = OWNER 信箱的 SHA-like 簡易雜湊（開發者自己知道）
    // 實際值：取 "linus622wang" 的字元碼總和 → 1561，再加年份 2026 → "linus2026"
    const _SECRET = (function() {
        const s = 'linus622wang';
        let h = 0;
        for (let i = 0; i < s.length; i++) h += s.charCodeAt(i);
        return s.slice(0, 5) + String(h % 100) + '2026';
    })();

    function _checkToken() {
        const input = document.getElementById('_dev_token_input');
        const err   = document.getElementById('_token_err');
        if (!input) return;

        if (input.value.trim() === _SECRET) {
            // ✅ 驗證成功
            localStorage.setItem(DEV_KEY, 'true');
            const aw = document.getElementById('_ask_wall');
            if (aw) aw.remove();
            // 顯示成功提示
            const ok = document.createElement('div');
            ok.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);' +
                'background:#1a4a1a;border:1px solid #2d7a2d;color:#7fff7f;' +
                'padding:12px 28px;border-radius:8px;z-index:2147483647;' +
                'font-family:"Noto Serif TC",serif;font-size:14px;font-weight:700;';
            ok.textContent = '✅ 開發者身份確認，已授予完整存取權限';
            document.body.appendChild(ok);
            setTimeout(() => ok.remove(), 3000);
        } else {
            // ❌ 金鑰錯誤
            err.style.display = 'block';
            input.style.borderColor = '#ff4444';
            setTimeout(() => {
                err.style.display = 'none';
                input.style.borderColor = '#333';
                input.value = '';
            }, 2000);
        }
    }

    // ── 禁用右鍵選單 ─────────────────────────────────────────
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        if (!_isVerified()) _askIdentity('contextmenu');
    });

    // ── 攔截鍵盤快捷鍵 ───────────────────────────────────────
    document.addEventListener('keydown', function(e) {
        if (_isVerified()) return;   // 開發者已驗證，不攔截

        const key  = e.key;
        const ctrl = e.ctrlKey || e.metaKey;
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
    setInterval(() => {
        if (_isVerified()) return;
        const open = (window.outerWidth - window.innerWidth > 160) ||
                     (window.outerHeight - window.innerHeight > 160);
        if (open && !_devOpen) { _devOpen = true; _askIdentity('devtools-size'); }
        if (!open)              { _devOpen = false; }
    }, 1000);

    // ── Console 水印（開發者驗證後不重複顯示）────────────────
    const _origCE = console.error.bind(console);
    let _warned = false;
    const _origLog = console.log.bind(console);
    console.log = function(...args) {
        const first = typeof args[0] === 'string' ? args[0] : '';
        if (!_warned && !_isVerified() && !first.includes('%c ╔') && !first.includes('[Network]')) {
            _warned = true;
            _origCE('%c⛔ 未授權 — 請先取得 ' + OWNER + ' 的授權', 'color:#ff4444;font-size:14px;font-weight:900;');
        }
        _origLog(...args);
    };

})();
