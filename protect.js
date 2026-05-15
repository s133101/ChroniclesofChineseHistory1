// ============================================================
//  華夏風雲錄 — protect.js
//  Copyright © 2026 linus622wang@gmail.com  All Rights Reserved.
//  程式碼保護層：未經授權禁止查看或修改
// ============================================================
(function _protect() {
    'use strict';

    const OWNER = 'linus622wang@gmail.com';

    // ── 權限警告彈窗 ─────────────────────────────────────────
    function _showPermissionWall(reason) {
        if (document.getElementById('_pwall')) return;
        const wall = document.createElement('div');
        wall.id = '_pwall';
        wall.style.cssText = [
            'position:fixed','inset:0','z-index:2147483647',
            'background:rgba(0,0,0,0.97)',
            'display:flex','flex-direction:column',
            'align-items:center','justify-content:center',
            'font-family:"Noto Serif TC",serif',
            'color:#d4af37','text-align:center','padding:40px',
            'backdrop-filter:blur(8px)'
        ].join(';');

        wall.innerHTML = `
            <div style="font-size:64px;margin-bottom:24px;">🔒</div>
            <div style="font-size:22px;font-weight:900;letter-spacing:4px;margin-bottom:16px;color:#fff;">
                存取受限
            </div>
            <div style="font-size:13px;color:#d4af37;margin-bottom:8px;letter-spacing:2px;">
                ACCESS RESTRICTED
            </div>
            <div style="
                background:rgba(212,175,55,0.08);
                border:1px solid rgba(212,175,55,0.3);
                border-radius:12px;padding:24px 32px;
                max-width:480px;margin:24px 0;line-height:2;
            ">
                <div style="font-size:14px;color:#eee;margin-bottom:12px;">
                    查看或修改本程式碼<br>需要獲得開發者的書面授權
                </div>
                <div style="font-size:12px;color:#aaa;margin-bottom:16px;">
                    Viewing or modifying this source code<br>
                    requires written permission from the developer.
                </div>
                <a href="mailto:${OWNER}?subject=華夏風雲錄程式碼授權申請&body=您好，我希望申請查看/修改華夏風雲錄程式碼的授權，原因如下：%0A%0A"
                   style="
                       display:inline-block;
                       background:linear-gradient(135deg,#b8860b,#d4af37);
                       color:#000;font-weight:900;
                       padding:12px 28px;border-radius:8px;
                       text-decoration:none;font-size:14px;
                       letter-spacing:1px;margin-top:8px;
                   ">
                    📧 聯繫開發者申請授權
                </a>
                <div style="font-size:11px;color:#555;margin-top:16px;">
                    ${OWNER}
                </div>
            </div>
            <div style="font-size:11px;color:#444;margin-top:8px;">
                © 2026 ${OWNER} · All Rights Reserved
            </div>
        `;
        document.body.appendChild(wall);
    }

    function _removePermissionWall() {
        const w = document.getElementById('_pwall');
        if (w) w.remove();
    }

    // ── 禁用右鍵選單（防止「檢視原始碼」）────────────────────
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        _showPermissionWall('contextmenu');
    });

    // ── 攔截鍵盤快捷鍵 ───────────────────────────────────────
    document.addEventListener('keydown', function(e) {
        const key = e.key;
        const ctrl = e.ctrlKey || e.metaKey;
        const shift = e.shiftKey;

        // F12 / DevTools 快捷鍵
        if (key === 'F12') { e.preventDefault(); _showPermissionWall('F12'); return; }

        // Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C（DevTools）
        if (ctrl && shift && (key === 'I' || key === 'i' ||
                               key === 'J' || key === 'j' ||
                               key === 'C' || key === 'c')) {
            e.preventDefault(); _showPermissionWall('devtools-key'); return;
        }

        // Ctrl+U（檢視原始碼）
        if (ctrl && (key === 'U' || key === 'u')) {
            e.preventDefault(); _showPermissionWall('view-source'); return;
        }

        // Ctrl+S（儲存）
        if (ctrl && (key === 'S' || key === 's')) {
            e.preventDefault(); return;
        }

        // Escape 關閉警告牆（讓玩家繼續遊戲，但不代表授權）
        if (key === 'Escape') { _removePermissionWall(); }
    });

    // ── DevTools 開啟偵測（視窗尺寸差值法）──────────────────
    let _devToolsOpen = false;
    const _THRESHOLD = 160;

    function _checkDevTools() {
        const widthDiff  = window.outerWidth  - window.innerWidth;
        const heightDiff = window.outerHeight - window.innerHeight;
        const isOpen = widthDiff > _THRESHOLD || heightDiff > _THRESHOLD;

        if (isOpen && !_devToolsOpen) {
            _devToolsOpen = true;
            _showPermissionWall('devtools-open');
        } else if (!isOpen && _devToolsOpen) {
            _devToolsOpen = false;
            _removePermissionWall();
        }
    }
    setInterval(_checkDevTools, 1000);

    // ── Console 攔截提示 ────────────────────────────────────
    const _noop = () => {};
    const _warn = () => {
        console.error(
            '%c⛔ 未授權存取',
            'color:#ff4444;font-size:20px;font-weight:900;',
        );
        console.error(
            '%c本程式碼受版權保護，查看或修改須經 ' + OWNER + ' 書面授權。',
            'color:#d4af37;font-size:13px;'
        );
    };

    // 覆寫 console 方法，讓嘗試透過 console 除錯的人看到警告
    const _origLog  = console.log.bind(console);
    const _origWarn = console.warn.bind(console);
    let _consoleCallCount = 0;
    ['log','warn','info','debug','table','dir'].forEach(method => {
        const orig = console[method].bind(console);
        console[method] = function(...args) {
            // 允許遊戲內部自己的 log（帶 [Network] 標頭的）
            const first = typeof args[0] === 'string' ? args[0] : '';
            if (first.includes('[Network]') || first.includes('%c ╔')) {
                return orig(...args);
            }
            _consoleCallCount++;
            if (_consoleCallCount === 1) _warn();
            orig(...args);
        };
    });

})();
