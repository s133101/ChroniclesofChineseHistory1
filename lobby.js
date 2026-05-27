/* ============================================================
   華夏風雲錄 — lobby.js

   Copyright © 2026 linus622wang@gmail.com
   All Rights Reserved.

   未經開發者 linus622wang@gmail.com 書面授權，
   嚴禁任何形式的複製、修改、散佈或商業使用。
   Unauthorized copying, modification, distribution,
   or commercial use of this file is strictly prohibited.
   ============================================================ */
'use strict';

(function () {
    // ── 配對計時器 ──
    let _timer     = null;
    let _seconds   = 30;

    // ── 暫存主機攻擊 (等待客方防禦回應) ──
    window._pendingHostAttack = null;

    let _isLaunching = false; 

    // ── 收集系統數據 ──
    window.playerOwnedCards = JSON.parse(localStorage.getItem('hua_owned_cards') || '[]');
    window.playerSilver = parseInt(localStorage.getItem('hua_player_silver') || '1000');

    // ── 玩家身份 (暱稱) ──
    const _defaultNames = ['無名大將','草莽英雄','天涯俠客','亂世豪傑','江湖遊俠','蕭何再世'];
    window.playerNickname = localStorage.getItem('hua_nickname') || _defaultNames[Math.floor(Math.random() * _defaultNames.length)];
    localStorage.setItem('hua_nickname', window.playerNickname);
    
    function _saveCollection() {
        localStorage.setItem('hua_owned_cards', JSON.stringify(window.playerOwnedCards));
        localStorage.setItem('hua_player_silver', window.playerSilver.toString());
    }
    window._saveCollection = _saveCollection;

    // ══════════════════════════════════════════
    //  DOMContentLoaded
    // ══════════════════════════════════════════
    document.addEventListener('DOMContentLoaded', () => {
        // 初始化管理員帳號（僅首次執行）
        if (typeof Auth !== 'undefined') Auth.initAdmin();

        _initIntro();
        _setupLobbyButtons();
        _setupNetworkEvents();
        _setupSocialCenter();
        _setupGachaUI();
        _updateHUD();
        
        // 檢查是否為新玩家，發放開局大禮

        setTimeout(() => {
            if (window.playerOwnedCards.length === 0) {
                _triggerStartingGift();
            }
        }, 3000); 
    });

    // ══════════════════════════════════════════
    //  標題畫面動畫 (君王登場)
    // ══════════════════════════════════════════
    async function _initIntro() {
        const container = document.getElementById('marvel-tokens-container');
        const river = document.getElementById('river-of-time-layer');
        const introUi = document.getElementById('intro-ui');
        const riverStrip = document.getElementById('river-strip');

        // ── 開場等待畫面元素 ────────────────────────────────────
    const _splashEl   = document.getElementById('splash-screen');
    const _splashBg   = document.getElementById('splash-bg');
    const _loaderBar  = document.getElementById('splash-loader-bar');
    const _splashHint = document.getElementById('splash-hint');

    // 立即開始淡入背景圖（非阻塞）
    if (_splashBg) {
        const _bgImg = new Image();
        _bgImg.onload = _bgImg.onerror = () => _splashBg.classList.add('loaded');
        _bgImg.src = 'assets/華夏文明人皇銘文圖.png';
    }

    if (!container || !river || typeof cardDatabase === 'undefined') {
        // 缺少必要元素：等 splash 點擊後直接走登入流程
        await new Promise(resolve => {
            const _auto = setTimeout(resolve, 5000);
            if (_splashEl) _splashEl.addEventListener('click', () => { clearTimeout(_auto); resolve(); }, { once: true });
        });
        if (_splashEl) {
            _splashEl.classList.add('fade-out');
            await new Promise(r => setTimeout(r, 1400));
            _splashEl.style.display = 'none';
        }
        const _r = await Auth.restoreSession();
        const _u = _r || await _showLoginScreen();
        _enterLobbyAsUser(_u);
        return;
    }

    // ── 預載入所有君王卡圖片（修復刷新後圖片消失問題）────────
    const _monarchImgSrcs = cardDatabase
        .filter(c => c.type === '君王' && c.name !== '秦二世胡亥' && c.img)
        .map(c => c.img);
    let _imgDone = 0;
    const _imgTotal = _monarchImgSrcs.length;

    await Promise.all(_monarchImgSrcs.map(src => new Promise(res => {
        const _img = new Image();
        _img.onload = _img.onerror = () => {
            _imgDone++;
            if (_loaderBar && _imgTotal > 0)
                _loaderBar.style.width = `${Math.round(_imgDone / _imgTotal * 100)}%`;
            res();
        };
        _img.src = src;
    })));

    // 所有圖片已快取，更新提示文字
    if (_loaderBar)  _loaderBar.style.width = '100%';
    if (_splashHint) _splashHint.textContent = '點擊任意處進入 ▶';

    // 等待玩家點擊，或 5 秒後自動繼續
    await new Promise(resolve => {
        const _auto = setTimeout(resolve, 5000);
        if (_splashEl) {
            _splashEl.addEventListener('click', () => { clearTimeout(_auto); resolve(); }, { once: true });
        }
    });

    // 淡出開場畫面
    if (_splashEl) {
        _splashEl.classList.add('fade-out');
        await new Promise(r => setTimeout(r, 1400));
        _splashEl.style.display = 'none';
    }
    // ── 開場畫面結束，先驗證身份再進入君王登場動畫 ──────────────

    // 嘗試還原 Session，否則顯示登入畫面
    const _restoredUser = await Auth.restoreSession();
    let _loggedUser = _restoredUser;
    if (!_loggedUser) {
        _loggedUser = await _showLoginScreen();
    }

        const historyData = [
            { t: '商朝 · 鳴條之戰', d: '成湯伐桀，終結夏朝統治，開創六百年大商國祚。', img: 'assets/history/h01.jpg' },
            { t: '周朝 · 禮樂文明', d: '武王克殷，周公制禮作樂，奠定華夏三千年文明基石。', img: 'assets/history/h02.jpg' },
            { t: '秦朝 · 帝國統一', d: '始皇廢分封行郡縣，書同文車同軌，開啟大一統時代。', img: 'assets/history/h03.jpg' },
            { t: '漢朝 · 封狼居胥', d: '大位定於漢，驃騎將軍北擊匈奴，漢威遠播四海。', img: 'assets/history/h04.jpg' },
            { t: '三國 · 赤壁烽火', d: '曹操南征，孫劉聯軍一炬火紅，鼎立之勢自此而成。', img: 'assets/history/h05.jpg' },
            { t: '隋朝 · 運河開鑿', d: '隋文帝開皇之治，大運河貫通南北，功在千秋。', img: 'assets/history/h06.jpg' },
            { t: '唐朝 · 貞觀氣象', d: '太宗李世民開貞觀盛世，天可汗之名萬國來朝。', img: 'assets/history/h07.jpg' },
            { t: '宋朝 · 繁華汴京', d: '清明上河盛景，文治達於極致，科技文化輝煌燦爛。', img: 'assets/history/h08.jpg' },
            { t: '元朝 · 橫跨歐亞', d: '成吉思汗子孫版圖橫跨東西，開啟大航海前的大融合。', img: 'assets/history/h09.jpg' },
            { t: '明朝 · 遠航西洋', d: '永樂大帝遣鄭和七下西洋，彰顯大明國威與航海實力。', img: 'assets/history/h10.jpg' },
            { t: '清朝 · 康乾盛世', d: '鼎盛大清開疆拓土，確立近代版圖，華夏落日餘暉。', img: 'assets/history/h11.jpg' }
        ];

        
        riverStrip.innerHTML = historyData.concat(historyData).map(h => `
            <div class="history-node" style="background-image: linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0.4)), url('${h.img}');">
                <div class="hn-title">${h.t}</div>
                <div class="hn-desc">${h.d}</div>
            </div>
        `).join('');

        const monarchs = cardDatabase.filter(c => c.type === '君王' && c.name !== '秦二世胡亥');
        const CARD_ART_MAP = { '君王':'👑', '大將軍':'⚔️', '將軍':'🐎', '軍師':'📜', '計策':'✨', '後勤':'🏛️', '內政':'🏮', '監察':'⚖️' };

        const tokens = monarchs.map(m => {
            const el = document.createElement('div');
            el.className = 'intro-monarch-token';
            if(m.img) {
                el.style.backgroundImage = `url('${m.img}')`;
                el.style.backgroundSize = 'cover';
                el.style.backgroundPosition = 'center';
                el.innerHTML = `<div class="imt-name" style="background:rgba(0,0,0,0.5); width:100%; text-align:center; padding:5px 0; position:absolute; bottom:0;">${m.name}</div>`;
            } else {
                el.innerHTML = `<div class="imt-art">${CARD_ART_MAP[m.type] || '👑'}</div><div class="imt-name" style="font-size:22px;">${m.name}</div><div class="imt-dynasty">${m.dynasty}</div>`;
            }
            container.appendChild(el);
            return el;
        });

        // 初始狀態：顯示大容器，但隱藏標題與按鈕
        river.style.display = 'none';
        river.style.opacity = '0';
        
        // 確保 UI 容器本身是可見的（因為它現在包含君王與長河）
        introUi.classList.remove('hidden');
        introUi.style.opacity = '1';
        introUi.style.pointerEvents = 'none';

        // 初始隱藏文字與按鈕
        const title = introUi.querySelector('.intro-game-title');
        const sub = introUi.querySelector('.intro-game-subtitle');
        const startBtn = introUi.querySelector('.intro-start-btn');
        if(title) title.style.opacity = '0';
        if(sub) sub.style.opacity = '0';
        if(startBtn) startBtn.style.opacity = '0';

        let introSkipped = false;
        const skipHandler = (e) => {
            if (introSkipped) return;
            // 如果點擊的是按鈕或互動元素則不跳過（避免干擾）
            if (e.target.closest('button')) return;
            
            introSkipped = true;
            // 立即停止當前君主顯示並進入下一步
            tokens.forEach(t => { t.classList.remove('active'); t.classList.add('vanish'); });
            window.removeEventListener('click', skipHandler);
            _showNextIntroPhase();
        };
        window.addEventListener('click', skipHandler);

        // 階段 1: 君主登場 (Marvel-style)
        for(let i=0; i<tokens.length; i++) {
            if(introSkipped) break;
            tokens[i].classList.add('active');
            await new Promise(r => setTimeout(r, 600));
            if(introSkipped) break;
            tokens[i].classList.remove('active');
            tokens[i].classList.add('vanish');
            await new Promise(r => setTimeout(r, 50));
        }

        // 結束點擊監聽並進入下一階段 (如果還沒跳過)
        if (!introSkipped) {
            window.removeEventListener('click', skipHandler);
            _showNextIntroPhase();
        }

        async function _showNextIntroPhase() {
            // 階段 2: 開放時間長河
            river.style.display = 'flex';
            setTimeout(() => { river.style.opacity = '1'; }, 50);
            
            // 用戶要求：在時間長河出現後，再延遲出現標題與按鈕
            // 增加至 1.5 秒讓順序更明確
            await new Promise(r => setTimeout(r, 1500));
            
            // 揭曉標題與按鈕 (觸發 CSS 動畫)
            const title = introUi.querySelector('.intro-game-title');
            const sub = introUi.querySelector('.intro-game-subtitle');
            const startBtn = introUi.querySelector('.intro-start-btn');
            
            if(title) title.classList.add('visible');
            if(sub) sub.classList.add('visible');
            if(startBtn) startBtn.classList.add('visible');
        }

        document.getElementById('btn-enter-lobby').addEventListener('click', async () => {
            const introEl = document.getElementById('intro-screen');
            introEl.style.transition = 'opacity 1s';
            introEl.style.opacity = '0';
            await new Promise(r => setTimeout(r, 1000));
            introEl.style.display = 'none';
            _enterLobbyAsUser(_loggedUser || Auth.current());
        });
    }

    // ══════════════════════════════════════════
    //  登入畫面邏輯
    // ══════════════════════════════════════════
    function _showLoginScreen() {
        return new Promise(resolveLogin => {
        const scr = document.getElementById('login-screen');
        if (scr) scr.classList.remove('hidden');

        const usernameEl = document.getElementById('login-username');
        const passwordEl = document.getElementById('login-password');
        const submitBtn  = document.getElementById('login-submit-btn');
        const errEl      = document.getElementById('login-error');
        const formPanel  = document.getElementById('login-form-panel');
        const codePanel  = document.getElementById('login-code-panel');
        const codeInput  = document.getElementById('login-code-input');
        const codeBtn    = document.getElementById('login-code-btn');
        const codeBackBtn= document.getElementById('login-code-back-btn');
        const codeErrEl  = document.getElementById('login-code-error');
        const codeHint   = document.getElementById('login-code-hint');

        let _pendingUsername = '';

        function showErr(el, msg) {
            el.textContent = msg;
            el.classList.remove('hidden');
        }
        function hideErr(el) { el.classList.add('hidden'); }

        // 登入按鈕
        async function doLogin() {
            hideErr(errEl);
            const u = (usernameEl.value || '').trim();
            const p = passwordEl.value || '';
            if (!u || !p) { showErr(errEl, '請填寫帳號與密碼'); return; }

            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ 驗證中...';

            const res = await Auth.login(u, p);

            submitBtn.disabled = false;
            submitBtn.textContent = '登 入';

            if (!res.ok) {
                showErr(errEl, res.err);
                return;
            }

            // 切換到驗證碼畫面
            _pendingUsername = res.username;
            codeHint.innerHTML = `驗證碼已傳送至<br><span style="color:var(--gold)">${res.emailHint}</span><br><small style="color:#555;">5分鐘內有效</small>`;
            formPanel.classList.add('hidden');
            codePanel.classList.remove('hidden');
            setTimeout(() => codeInput.focus(), 100);
        }

        submitBtn.onclick = doLogin;
        passwordEl.onkeydown = e => { if (e.key === 'Enter') doLogin(); };
        usernameEl.onkeydown = e => { if (e.key === 'Enter') passwordEl.focus(); };

        // 驗證碼確認
        async function doVerify() {
            hideErr(codeErrEl);
            const code = (codeInput.value || '').trim();
            if (code.length !== 6) { showErr(codeErrEl, '請輸入 6 位驗證碼'); return; }

            codeBtn.disabled = true;
            codeBtn.textContent = '⏳ 驗證中...';

            const res = await Auth.verifyCode(_pendingUsername, code);

            codeBtn.disabled = false;
            codeBtn.textContent = '確 認';

            if (!res.ok) {
                showErr(codeErrEl, res.err);
                codeInput.value = '';
                return;
            }

            // 登入成功 — 淡出登入畫面後解析 Promise，讓君王登場動畫繼續
            const scr2 = document.getElementById('login-screen');
            if (scr2) { scr2.style.opacity = '0'; scr2.style.transition = 'opacity .6s'; }
            setTimeout(() => {
                if (scr2) scr2.classList.add('hidden');
                resolveLogin(res.user);
            }, 600);
        }

        codeBtn.onclick = doVerify;
        codeInput.onkeydown = e => { if (e.key === 'Enter') doVerify(); };

        // ── 登入 ↔ 註冊 切換（先宣告，避免 closure 參照問題）───────
        const regPanel       = document.getElementById('login-register-panel');
        const toRegBtn       = document.getElementById('login-to-register-btn');
        const regBackBtn     = document.getElementById('reg-back-btn');
        const regSubmitBtn   = document.getElementById('reg-submit-btn');
        const regUsernameEl  = document.getElementById('reg-username');
        const regEmailEl     = document.getElementById('reg-email');
        const regPasswordEl  = document.getElementById('reg-password');
        const regConfirmEl   = document.getElementById('reg-confirm');
        const regErrEl       = document.getElementById('reg-error');
        const toggleRow      = document.getElementById('login-toggle-row');

        // 返回（登入或註冊面板）
        let _codeBackTarget = 'login'; // 'login' or 'register'
        if (codeBackBtn) {
            codeBackBtn.onclick = () => {
                hideErr(codeErrEl);
                codeInput.value = '';
                codePanel.classList.add('hidden');
                if (_codeBackTarget === 'register' && regPanel) {
                    regPanel.classList.remove('hidden');
                    if (toggleRow) toggleRow.classList.add('hidden');
                } else {
                    formPanel.classList.remove('hidden');
                    if (toggleRow) toggleRow.classList.remove('hidden');
                    passwordEl.value = '';
                    setTimeout(() => usernameEl.focus(), 100);
                }
            };
        }

        if (toRegBtn) {
            toRegBtn.onclick = () => {
                formPanel.classList.add('hidden');
                if (toggleRow) toggleRow.classList.add('hidden');
                if (regPanel) regPanel.classList.remove('hidden');
                if (regUsernameEl) setTimeout(() => regUsernameEl.focus(), 100);
            };
        }
        if (regBackBtn) {
            regBackBtn.onclick = () => {
                if (regErrEl) hideErr(regErrEl);
                if (regPanel) regPanel.classList.add('hidden');
                if (toggleRow) toggleRow.classList.remove('hidden');
                formPanel.classList.remove('hidden');
                setTimeout(() => usernameEl.focus(), 100);
            };
        }

        // 註冊提交
        async function doRegister() {
            if (!regErrEl || !regUsernameEl || !regEmailEl || !regPasswordEl || !regConfirmEl) return;
            hideErr(regErrEl);
            const u = (regUsernameEl.value || '').trim();
            const e = (regEmailEl.value || '').trim();
            const p = regPasswordEl.value || '';
            const c = regConfirmEl.value || '';

            if (regSubmitBtn) { regSubmitBtn.disabled = true; regSubmitBtn.textContent = '⏳ 建立中...'; }

            const res = await Auth.register(u, e, p, c);

            if (regSubmitBtn) { regSubmitBtn.disabled = false; regSubmitBtn.textContent = '建 立 帳 號'; }

            if (!res.ok) { showErr(regErrEl, res.err); return; }

            // 切換到驗證碼畫面
            _pendingUsername = res.username;
            _codeBackTarget = 'register';
            codeHint.innerHTML =
                `帳號 <span style="color:var(--gold)">${res.username}</span> 已建立！<br>` +
                `暱稱：<span style="color:var(--gold)">${res.nickname}</span><br>` +
                `驗證碼已傳送至 <span style="color:var(--gold)">${res.emailHint}</span><br>` +
                `<small style="color:#555;">5分鐘內有效</small>`;
            if (regPanel) regPanel.classList.add('hidden');
            codePanel.classList.remove('hidden');
            setTimeout(() => codeInput.focus(), 100);
        }

        if (regSubmitBtn) regSubmitBtn.onclick = doRegister;
        if (regConfirmEl) regConfirmEl.onkeydown = e => { if (e.key === 'Enter') doRegister(); };
        }); // end Promise
    }

    // ── 登入後進入大廳 ────────────────────────────────────────
    function _enterLobbyAsUser(user) {
        // 更新玩家暱稱
        window.playerNickname = user.nickname || user.username;
        localStorage.setItem('hua_nickname', window.playerNickname);

        // 顯示頭像按鈕
        _updateAvatarBtn(user);
        const _avatarBtn = document.getElementById('player-avatar-btn');
        if (_avatarBtn) {
            _avatarBtn.classList.remove('hidden');
            _avatarBtn.style.display = 'flex'; // 強制顯示，防止 hidden 殘留
        }

        // 套用已儲存的縮放
        const savedZoom = parseInt(localStorage.getItem('hua_zoom') || '100');
        _applyZoom(savedZoom);

        _switchScreen('lobby-screen');
        setTimeout(() => openSidebar(), 1500);
    }

    // ── 更新頭像按鈕顯示 ──────────────────────────────────────
    function _updateAvatarBtn(user) {
        const nameEl  = document.getElementById('player-avatar-name');
        const imgEl   = document.getElementById('player-avatar-img');
        const iconEl  = document.getElementById('player-avatar-icon');
        if (nameEl) nameEl.textContent = user.nickname || user.username;
        if (user.avatar) {
            imgEl.src = user.avatar;
            imgEl.classList.remove('hidden');
            if (iconEl) iconEl.style.display = 'none';
        } else {
            imgEl.classList.add('hidden');
            if (iconEl) iconEl.style.display = '';
        }
    }

    // ── 縮放功能 ──────────────────────────────────────────────
    function _applyZoom(level) {
        document.body.style.zoom = (level / 100).toString();
        localStorage.setItem('hua_zoom', level.toString());
    }

    // ══════════════════════════════════════════
    //  玩家設定 Modal
    // ══════════════════════════════════════════
    window._openProfileModal = function() {
        const modal = document.getElementById('profile-modal');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.style.display = 'flex'; // 強制顯示

        const user = Auth.current();

        // ── ① 頭像 ────────────────────────────────────────────
        const previewImg  = document.getElementById('profile-avatar-preview-img');
        const previewIcon = document.getElementById('profile-avatar-preview-icon');
        if (previewImg) {
            if (user && user.avatar) {
                previewImg.src = user.avatar;
                previewImg.style.display = 'block';
                if (previewIcon) previewIcon.style.display = 'none';
            } else {
                previewImg.style.display = 'none';
                if (previewIcon) previewIcon.style.display = '';
            }
        }

        const uploadInput = document.getElementById('profile-avatar-upload');
        if (uploadInput) {
            uploadInput.onchange = function() {
                const file = this.files[0];
                if (!file || !file.type.startsWith('image/')) return;
                const reader = new FileReader();
                reader.onload = e => {
                    if (previewImg) { previewImg.src = e.target.result; previewImg.style.display = 'block'; }
                    if (previewIcon) previewIcon.style.display = 'none';
                };
                reader.readAsDataURL(file);
            };
        }

        const avatarMsg  = document.getElementById('profile-avatar-msg');
        const avatarSave = document.getElementById('profile-avatar-save-btn');
        if (avatarSave) {
            avatarSave.onclick = async function() {
                if (!previewImg || !previewImg.src || previewImg.src === window.location.href) return;
                avatarSave.disabled = true;
                const res = await Auth.updateAvatar(previewImg.src);
                avatarSave.disabled = false;
                _showProfileMsg(avatarMsg, res.ok, res.ok ? '頭像已更新' : res.err);
                if (res.ok) _updateAvatarBtn(Auth.current());
            };
        }

        // ── ② 名號 ───────────────────────────────────────────
        const nicknameInput  = document.getElementById('nickname-input');
        const nicknameMsg    = document.getElementById('profile-nickname-msg');
        const nicknameSave   = document.getElementById('profile-nickname-save-btn');
        if (nicknameInput) nicknameInput.value = window.playerNickname || '';
        if (nicknameSave) {
            nicknameSave.onclick = async function() {
                const v = (nicknameInput ? nicknameInput.value : '').trim();
                if (!v) { _showProfileMsg(nicknameMsg, false, '名號不能為空'); return; }
                if (v === window.playerNickname) { _showProfileMsg(nicknameMsg, true, '名號未變更'); return; }

                nicknameSave.disabled = true;
                const available = await Auth.checkNickname(v);
                if (!available) {
                    _showProfileMsg(nicknameMsg, false, '這名稱已被使用');
                    nicknameSave.disabled = false;
                    return;
                }

                const res = await Auth.updateNickname(v);
                nicknameSave.disabled = false;
                if (res.ok) {
                    window.playerNickname = v;
                    localStorage.setItem('hua_nickname', v);
                    _showProfileMsg(nicknameMsg, true, '名號已更新');
                    const avatarNameEl = document.getElementById('player-avatar-name');
                    if (avatarNameEl) avatarNameEl.textContent = v;
                } else {
                    _showProfileMsg(nicknameMsg, false, res.err || '更新失敗');
                }
            };
        }

        // ── ③ 更改密碼 ────────────────────────────────────────
        const pwdMsg  = document.getElementById('profile-pwd-msg');
        const pwdSave = document.getElementById('profile-pwd-save-btn');
        const oldPwd  = document.getElementById('profile-old-pwd');
        const newPwd  = document.getElementById('profile-new-pwd');
        const cfmPwd  = document.getElementById('profile-confirm-pwd');
        if (pwdSave && oldPwd && newPwd && cfmPwd) {
            pwdSave.onclick = async function() {
                if (pwdMsg) pwdMsg.classList.add('hidden');
                const o = oldPwd.value, n = newPwd.value, c = cfmPwd.value;
                if (!o || !n || !c) { _showProfileMsg(pwdMsg, false, '請填寫所有欄位'); return; }
                if (n.length < 6)  { _showProfileMsg(pwdMsg, false, '新密碼至少 6 個字元'); return; }
                if (n !== c)       { _showProfileMsg(pwdMsg, false, '兩次輸入的密碼不一致'); return; }
                pwdSave.disabled = true;
                const res = await Auth.changePassword(o, n);
                pwdSave.disabled = false;
                _showProfileMsg(pwdMsg, res.ok, res.ok ? '密碼已更改' : res.err);
                if (res.ok) { oldPwd.value = ''; newPwd.value = ''; cfmPwd.value = ''; }
            };
        }

        // ── ③ 個人留言 ────────────────────────────────────────
        const msgTextarea = document.getElementById('profile-message');
        const msgMsg      = document.getElementById('profile-message-msg');
        const msgSave     = document.getElementById('profile-msg-save-btn');
        if (msgTextarea && user) msgTextarea.value = user.message || '';
        if (msgSave) {
            msgSave.onclick = async function() {
                const text = (msgTextarea ? msgTextarea.value : '').trim();
                msgSave.disabled = true;
                const res = await Auth.updateMessage(text);
                msgSave.disabled = false;
                _showProfileMsg(msgMsg, res.ok, res.ok ? '留言已儲存' : res.err);
            };
        }

        // 點背景關閉
        modal.onclick = function(e) {
            if (e.target === modal) window._closeProfileModal();
        };
    };

    window._closeProfileModal = function() {
        const modal = document.getElementById('profile-modal');
        if (modal) modal.classList.add('hidden');
        ['profile-old-pwd','profile-new-pwd','profile-confirm-pwd'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    };

    function _showProfileMsg(el, ok, msg) {
        if (!el) return;
        if (!msg) { el.classList.add('hidden'); return; }
        el.textContent = msg;
        el.className = 'profile-msg ' + (ok ? 'ok' : 'err');
        setTimeout(() => el.classList.add('hidden'), 3000);
    }

    // Sidebar mechanics
    window.toggleSidebar = function() {
        const sb = document.getElementById('social-sidebar');
        const closeBtn = document.getElementById('close-sidebar-btn');
        const openBtn = document.getElementById('open-sidebar-btn');
        if (!sb) return;

        if (sb.classList.contains('active')) {
            // 現在是開啟 -> 關閉
            sb.classList.remove('active');
            if (closeBtn) closeBtn.style.display = 'none';
            if (openBtn) openBtn.classList.remove('hidden');
        } else {
            // 現在是關閉 -> 開啟
            sb.classList.add('active');
            if (closeBtn) closeBtn.style.display = 'flex';
            if (openBtn) openBtn.classList.add('hidden');
        }
    };
    
    // 全域導出供代碼其他部分調用
    window.openSidebar = () => {
        const sb = document.getElementById('social-sidebar');
        if(sb && !sb.classList.contains('active')) window.toggleSidebar();
    };
    window.closeSidebar = () => {
        const sb = document.getElementById('social-sidebar');
        if(sb && sb.classList.contains('active')) window.toggleSidebar();
    };

    // ══════════════════════════════════════════
    //  社交與競價公告系統 (Social & Bidding Center)
    // ══════════════════════════════════════════
    // 203: // 玩家財產全域變數
    // 204: // window.playerSilver = 100; // 已由 LocalStorage 初始化，此處刪除重複賦值

    function _escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _setupSocialCenter() {
        const chatInput = document.getElementById('chat-input');
        const btnSend = document.getElementById('btn-send-chat');
        const chatMessages = document.getElementById('chat-messages');

        // ── 暱稱初始化 ──
        // 名號輸入已移至頭像視圖 (profile modal)

        // ── 互動右鍵選單 ──
        const ctxMenu = document.getElementById('chat-context-menu');
        let _ctxTargetName = null;

        function showPlayerMenu(name, x, y) {
            if (!ctxMenu || name === window.playerNickname) return;
            _ctxTargetName = name;
            const nameEl = document.getElementById('ctx-menu-player-name');
            if (nameEl) nameEl.textContent = '👤 ' + name;
            // Position: prevent overflow off screen
            const mw = 200, mh = 140;
            ctxMenu.style.left = Math.min(x, window.innerWidth - mw) + 'px';
            ctxMenu.style.top  = Math.min(y, window.innerHeight - mh) + 'px';
            ctxMenu.classList.remove('hidden');
        }

        function hidePlayerMenu() { if (ctxMenu) ctxMenu.classList.add('hidden'); }

        // Wire context menu buttons
        const ctxAddFriend = document.getElementById('ctx-add-friend');
        const ctxPrivateMsg = document.getElementById('ctx-private-msg');
        const ctxClose = document.getElementById('ctx-close');
        if (ctxAddFriend) ctxAddFriend.onclick = () => { if (_ctxTargetName) window.addFriend(_ctxTargetName); hidePlayerMenu(); };
        if (ctxPrivateMsg) ctxPrivateMsg.onclick = () => { if (_ctxTargetName) { window.addFriend(_ctxTargetName); window.switchChatMode('friend'); window.selectFriend(_ctxTargetName); } hidePlayerMenu(); };
        if (ctxClose) ctxClose.onclick = () => hidePlayerMenu();
        // Dismiss on outside click
        document.addEventListener('click', (e) => {
            if (ctxMenu && !ctxMenu.contains(e.target) && !e.target.classList.contains('chat-sender-name')) hidePlayerMenu();
        });

        // ── 通知系統 ──
        let _hasUnreadDM = false;
        function _showNotifDot() {
            const dot = document.getElementById('chat-notif-dot');
            if (dot) { dot.classList.remove('hidden'); _hasUnreadDM = true; }
        }
        function _clearNotifDot() {
            const dot = document.getElementById('chat-notif-dot');
            if (dot) { dot.classList.add('hidden'); _hasUnreadDM = false; }
        }

        // 1. 聊天系統傳送
        // --- 聊天訊息保留期限（必須在 _appendChatMessage 之前宣告）---
        const CHAT_GLOBAL_TTL  = 30 * 60 * 1000;           // 全域：保留最近 30 分鐘
        const CHAT_FRIEND_TTL  = 30 * 24 * 60 * 60 * 1000; // 好友：保留最近 1 個月

        // --- 好友與聊天模式狀態 ---
        let _chatMode = 'global'; // 'global', 'room', 'friend'
        let _targetFriend = null;
        let _lastGlobalTime = 0;
        let _friends = JSON.parse(localStorage.getItem('hua_friends') || '[]');

        window._appendChatMessage = function(text, sender, mode = 'room', fromName = '匿名') {
            if (!chatMessages) return;
            const sysMsg = chatMessages.querySelector('.sys-msg');
            if (sysMsg) sysMsg.remove();

            // Save to history
            const msgObj = { text, sender, mode, fromName, time: Date.now() };
            if (mode === 'global') {
                let gHist = JSON.parse(localStorage.getItem('hua_chat_global') || '[]');
                gHist.push(msgObj);
                // 只保留最近 10 分鐘
                gHist = gHist.filter(m => (Date.now() - m.time) < CHAT_GLOBAL_TTL);
                localStorage.setItem('hua_chat_global', JSON.stringify(gHist));
            } else if (mode === 'room') {
                let rHist = JSON.parse(localStorage.getItem('hua_chat_room') || '[]');
                rHist.push(msgObj);
                localStorage.setItem('hua_chat_room', JSON.stringify(rHist));
            } else if (mode === 'friend') {
                let fHist = JSON.parse(localStorage.getItem('hua_chat_friend') || '[]');
                // 只保留最近 1 個月
                fHist = fHist.filter(m => (Date.now() - m.time) < CHAT_FRIEND_TTL);
                // 用排序後的雙方名稱建立唯一對話 ID，確保 A-B 的對話 C 看不到
                const target = sender === 'me' ? _targetFriend : fromName;
                msgObj.chatPair = [window.playerNickname, target].sort().join('<->');
                fHist.push(msgObj);
                localStorage.setItem('hua_chat_friend', JSON.stringify(fHist));
            }

            // Only append visually if we are in the correct mode
            let shouldAppend = false;
            if (_chatMode === 'friend' && mode === 'friend') {
                if (sender === 'me' || fromName === _targetFriend) shouldAppend = true;
            } else if (_chatMode === 'global' && mode === 'global') {
                shouldAppend = true;
            } else if (_chatMode === 'room' && mode === 'room') {
                shouldAppend = true;
            }

            if (shouldAppend) {
                _renderSingleMsg(msgObj);
            }
        };

        function _renderSingleMsg(msgObj) {
            const { text, sender, mode, fromName } = msgObj;
            const msgDiv = document.createElement('div');
            Object.assign(msgDiv.style, {
                padding: '8px 12px', borderRadius: '8px', marginBottom: '6px',
                fontSize: '14px', lineHeight: '1.4', maxWidth: '85%', marginLeft: sender === 'me' ? 'auto' : '0',
                background: sender === 'me' ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.1)',
                border: sender === 'me' ? '1px solid var(--gold)' : '1px solid rgba(255,255,255,0.2)',
                color: sender === 'me' ? '#fff' : '#ccc', wordBreak: 'break-word'
            });

            if (mode === 'global' && sender !== 'me') {
                const nameSpan = document.createElement('span');
                nameSpan.className = 'chat-sender-name';
                nameSpan.textContent = '[🌏 ' + fromName + ']';
                nameSpan.onclick = (e) => { e.stopPropagation(); showPlayerMenu(fromName, e.clientX, e.clientY); };
                msgDiv.appendChild(nameSpan);
                msgDiv.appendChild(document.createTextNode(text));
            } else if (mode === 'friend' && sender !== 'me') {
                const nameSpan = document.createElement('span');
                nameSpan.className = 'chat-sender-name dm-sender';
                nameSpan.textContent = '[👤 ' + fromName + ']';
                nameSpan.onclick = (e) => { e.stopPropagation(); showPlayerMenu(fromName, e.clientX, e.clientY); };
                msgDiv.appendChild(nameSpan);
                msgDiv.appendChild(document.createTextNode(text));
            } else {
                msgDiv.textContent = text;
            }

            chatMessages.appendChild(msgDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        window._renderChatHistory = function(mode) {
            if (!chatMessages) return;
            chatMessages.innerHTML = '';
            let hist = [];
            if (mode === 'global') {
                hist = JSON.parse(localStorage.getItem('hua_chat_global') || '[]');
                hist = hist.filter(m => (Date.now() - m.time) < CHAT_GLOBAL_TTL);
                localStorage.setItem('hua_chat_global', JSON.stringify(hist));
            } else if (mode === 'room') {
                hist = JSON.parse(localStorage.getItem('hua_chat_room') || '[]');
            } else if (mode === 'friend') {
                hist = JSON.parse(localStorage.getItem('hua_chat_friend') || '[]');
                // 清除超過 1 個月的好友訊息
                hist = hist.filter(m => (Date.now() - m.time) < CHAT_FRIEND_TTL);
                localStorage.setItem('hua_chat_friend', JSON.stringify(hist));
                const currentPair = [window.playerNickname, _targetFriend].sort().join('<->');
                hist = hist.filter(m => m.chatPair === currentPair);
            }
            hist.forEach(msg => _renderSingleMsg(msg));

            if (hist.length === 0) {
                chatMessages.innerHTML = `<div class="sys-msg">--- 已切換至${mode === 'global' ? '全域' : (mode === 'room' ? '房間' : '好友')}頻道 ---</div>`;
            }
        };

        const sendMessage = () => {
            if (!chatInput) return;
            const text = chatInput.value.trim();
            if (!text) return;

            if (_chatMode === 'global') {
                const now = Date.now();
                if (now - _lastGlobalTime < 5000) {
                    toast('全域發布過於頻繁，等候 ' + Math.ceil((5000 - (now - _lastGlobalTime))/1000) + ' 秒', 'warn');
                    return;
                }
                _lastGlobalTime = now;
                _startGlobalCooldown();
                
                // 全域通過 localStorage 同步
                const globalMsg = { text, from: window.playerNickname, time: now };
                localStorage.setItem('hua_global_chat_sync', JSON.stringify(globalMsg));
                window._appendChatMessage(text, 'me', 'global');
            } else if (_chatMode === 'room') {
                if (!Network || !Network.connected) {
                    toast('目前尚未連線對手，無法傳送房間通訊！', 'danger'); return;
                }
                Network.send('chat_msg', text);
                window._appendChatMessage(text, 'me', 'room');
            } else if (_chatMode === 'friend') {
                if (!_targetFriend) { toast('請先選擇一位好友！', 'warn'); return; }
                const dm = { text, to: _targetFriend, from: window.playerNickname, time: Date.now() };
                localStorage.setItem('hua_dm_sync', JSON.stringify(dm));
                window._appendChatMessage(text, 'me', 'friend');
            }
            chatInput.value = '';
        };

        // Wire send button and Enter key
        if (btnSend) btnSend.addEventListener('click', sendMessage);
        if (chatInput) chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

        // ── 自動刷新計時器 ──────────────────────────────────────────
        // 全域頻道：每 10 分鐘自動重新渲染（清除超時訊息）
        setInterval(() => {
            if (_chatMode === 'global') {
                window._renderChatHistory('global');
            }
        }, CHAT_GLOBAL_TTL);

        function _startGlobalCooldown() {
            if (!btnSend) return;
            btnSend.disabled = true;
            let count = 5;
            const timer = setInterval(() => {
                count--;
                btnSend.textContent = count + 's';
                if (count <= 0) {
                    clearInterval(timer);
                    btnSend.disabled = false;
                    btnSend.textContent = '發送';
                }
            }, 1000);
        }

        // --- 全域導覽功能 ---
        window.switchTab = (tabId) => {
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            const target = document.getElementById('tab-' + tabId);
            const btn = document.getElementById('tab-btn-' + tabId);
            if (target) target.classList.remove('hidden');
            if (btn) btn.classList.add('active');

            if (tabId === 'chat') _clearNotifDot();
            if (tabId === 'leaderboard') renderLeaderboard();
            if (tabId === 'announcements') renderAnnouncementsHistory();
        };

        window.switchChatMode = (mode) => {
            _chatMode = mode;
            if (mode === 'friend') _clearNotifDot();
            document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
            const btn = document.getElementById('chat-mode-' + mode);
            if (btn) btn.classList.add('active');
            
            const friendArea = document.getElementById('friend-list-area');
            const chatHeader = document.getElementById('chat-context-header');
            
            if (mode === 'friend') {
                if (friendArea) friendArea.classList.remove('hidden');
                if (chatHeader) {
                    chatHeader.style.display = 'block';
                    chatHeader.textContent = _targetFriend ? `正在與 [${_targetFriend}] 私聊...` : '點擊下方好友開始私聊';
                }
                renderFriendsList();
            } else {
                if (friendArea) friendArea.classList.add('hidden');
                if (chatHeader) chatHeader.style.display = 'none';
            }
            
            window._renderChatHistory(mode);
        };

        window.addFriend = (name) => {
            if (!name) return;
            if (!_friends.includes(name)) {
                _friends.push(name);
                localStorage.setItem('hua_friends', JSON.stringify(_friends));
                toast(`已將 ${name} 加入好友！`, 'success');
            }
            renderFriendsList();
        };

        function renderFriendsList() {
            const area = document.getElementById('friend-items-list');
            if (!area) return;
            if (_friends.length === 0) {
                area.innerHTML = '<div style="color:#555; text-align:center; padding:20px; font-size:12px;">尚無好友，請點擊上方按鈕新增。</div>';
                return;
            }
            area.innerHTML = _friends.map(f => `
                <div class="friend-item" style="cursor:default;">
                    <div class="friend-status-dot"></div>
                    <div style="flex:1; color:#eee; font-size:14px;">${_escHtml(f)}</div>
                    <div class="friend-avatar-btn" data-friend="${_escHtml(f)}" title="點擊私聊" style="cursor:pointer; background:rgba(212,175,55,0.2); border:1px solid var(--gold); border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; font-size:16px; transition:0.2s;">
                        👤
                    </div>
                </div>
            `).join('');
            area.querySelectorAll('.friend-avatar-btn[data-friend]').forEach(btn => {
                btn.addEventListener('click', () => window.selectFriend(btn.getAttribute('data-friend')));
            });
        }

        window.selectFriend = (name) => {
            _targetFriend = name;
            const chatHeader = document.getElementById('chat-context-header');
            if (chatHeader) chatHeader.textContent = `正在與 [${name}] 私聊...`;
            window._renderChatHistory('friend');
        };

        window.openAddFriendModal = () => {
            document.getElementById('add-friend-modal').classList.remove('hidden');
            document.getElementById('friend-search-input').value = '';
            document.getElementById('search-result-container').innerHTML = '<div style="color:#666; font-size:14px;">請輸入名稱並開始搜尋</div>';
        };

        window.searchFriend = () => {
            const input = document.getElementById('friend-search-input');
            const resultArea = document.getElementById('search-result-container');
            const name = input.value.trim();
            if (!name) return;

            if (name === window.playerNickname) {
                resultArea.innerHTML = '<div style="color:#e74c3c; font-size:14px;">不能搜尋自己！</div>';
                return;
            }

            resultArea.innerHTML = '<div class="loader"></div>';

            setTimeout(() => {
                // 模擬搜尋邏輯：如果名字長度大於 2 就當作有此人 (為了示範)
                if (name.length >= 2) {
                    resultArea.innerHTML = `
                        <div class="search-result-avatar">👤</div>
                        <div class="search-result-name">${_escHtml(name)}</div>
                        <div style="color:#27ae60; font-size:12px; margin-top:5px;">● 在線</div>
                        <button id="btn-search-add-friend" class="lobby-btn" style="margin-top:15px; width:120px;">➕ 加為好友</button>
                    `;
                    const addBtn = document.getElementById('btn-search-add-friend');
                    if (addBtn) addBtn.addEventListener('click', () => window.addFriend(name));
                } else {
                    resultArea.innerHTML = `
                        <div style="font-size:48px; margin-bottom:10px;">❓</div>
                        <div style="color:#888;">毫無此人</div>
                        <div style="font-size:12px; color:#555; margin-top:5px;">請確認名號是否輸入正確</div>
                    `;
                }
            }, 800);
        };

        // 第二個 addFriend 已移除（重複定義，且呼叫未定義的 _renderFriends）

        window.addEventListener('storage', (e) => {
            if (e.key === 'hua_global_chat_sync') {
                const data = JSON.parse(e.newValue);
                if (data && data.from !== window.playerNickname) {
                    window._appendChatMessage(data.text, 'other', 'global', data.from);
                }
            }
            if (e.key === 'hua_dm_sync') {
                const data = JSON.parse(e.newValue);
                if (data && data.to === window.playerNickname) {
                    window._appendChatMessage(data.text, 'other', 'friend', data.from);
                    toast(`收到來自 ${data.from} 的私訊`, 'info');
                    // Show notification if not currently on chat/friend tab
                    const chatTab = document.getElementById('tab-chat');
                    const isChatVisible = chatTab && !chatTab.classList.contains('hidden');
                    if (!isChatVisible || _chatMode !== 'friend') {
                        _showNotifDot();
                    }
                }
            }
        });

        // 2. 廣播公告 (頂端置頂) - 新介面邏輯
        const annModal = document.getElementById('announce-modal');
        const annConfirm = document.getElementById('btn-announce-confirm');
        const annInput = document.getElementById('announce-input');
        const annCards = document.querySelectorAll('.tier-card');
        const annTitle = document.getElementById('announce-modal-title');
        let selectedTier = 1;
        let selectedCost = 10;
        let titleClickCount = 0;

        // 選擇階級
        annCards.forEach(card => {
            card.addEventListener('click', () => {
                annCards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                selectedTier = parseInt(card.getAttribute('data-tier'));
                selectedCost = parseInt(card.getAttribute('data-cost'));
                annConfirm.textContent = `確認發布 (${selectedCost} 兩)`;
            });
        });

        // 隱藏開發者階級揭曉 (五連點標題)
        if (annTitle) {
            annTitle.addEventListener('click', () => {
                titleClickCount++;
                if (titleClickCount >= 5) {
                    const devCard = document.getElementById('dev-tier-card');
                    if (devCard) devCard.style.display = 'block';
                    _showError('⚠️ 檢測到系統維護指令，開發者權項已開啟。');
                }
            });
        }

        // 提示詞觸發管理員模式 (輸入 /admin 或 ATW5856LINUS)
        if (annInput) {
            annInput.addEventListener('input', (e) => {
                const val = e.target.value;
                // 1. 原有的 /admin
                if (val.includes('/admin')) {
                    e.target.value = val.replace('/admin', '');
                    document.getElementById('admin-auth-modal').classList.remove('hidden');
                    document.getElementById('admin-pwd-input').value = '';
                    document.getElementById('admin-pwd-input').focus();
                }
                
                // 2. 開發者專屬密碼 ATW5856LINUS
                if (val === 'ATW5856LINUS') {
                    e.target.value = ''; // 清空密碼，防止下次打開直接觸發
                    document.getElementById('announce-modal').classList.add('hidden');
                    document.getElementById('dev-announce-modal').classList.remove('hidden');
                    document.getElementById('dev-announce-input').value = '';
                }
            });
        }

        window.closeDevModal = () => {
            document.getElementById('dev-announce-modal').classList.add('hidden');
        };

        const btnAdminVerify = document.getElementById('btn-admin-verify');
        if (btnAdminVerify) {
            btnAdminVerify.onclick = () => {
                const pwd = document.getElementById('admin-pwd-input').value;
                if (pwd === '888888') {
                    document.getElementById('admin-auth-modal').classList.add('hidden');
                    toast('🔑 最高權限已解鎖！', 'success');
                    
                    // 升級為專屬管理員的發布天下皇榜
                    const devCard = document.getElementById('dev-tier-card');
                    if (devCard) devCard.style.display = 'block';
                    
                    annTitle.textContent = '🚀 專屬管理員發布';
                    annTitle.style.color = '#9f7aea';
                    document.querySelector('#announce-modal .modal-content').style.borderColor = '#9f7aea';
                    
                    // 自動選擇開發者階級
                    annCards.forEach(c => c.classList.remove('active'));
                    if (devCard) {
                        devCard.classList.add('active');
                        selectedTier = parseInt(devCard.getAttribute('data-tier'));
                        selectedCost = parseInt(devCard.getAttribute('data-cost'));
                    }
                    annConfirm.textContent = '發布最高旨意 (免費)';
                    annConfirm.style.background = 'linear-gradient(135deg, #6b46c1, #9f7aea)';
                } else {
                    toast('❌ 密碼錯誤，拒絕存取！', 'danger');
                }
            };
        }

        const btnPublish = document.getElementById('btn-publish-board');
        if (btnPublish && annModal) {
            btnPublish.addEventListener('click', () => {
                // 重設狀態
                annInput.value = '';
                titleClickCount = 0;
                annModal.classList.remove('hidden');
                
                // 還原預設外觀
                annTitle.textContent = '📜 發布天下皇榜';
                annTitle.style.color = 'var(--gold)';
                document.querySelector('#announce-modal .modal-content').style.borderColor = 'var(--border)';
                const devCard = document.getElementById('dev-tier-card');
                if (devCard) devCard.style.display = 'none';
                annConfirm.style.background = '';
                
                // 預設選中銅榜
                annCards.forEach(c => c.classList.remove('active'));
                const tier1 = document.querySelector('.tier-card[data-tier="1"]');
                if (tier1) tier1.classList.add('active');
                selectedTier = 1;
                selectedCost = 10;
                annConfirm.textContent = `確認發布 (10 兩)`;
            });
        }

        if (annConfirm) {
            annConfirm.onclick = () => {
                const msg = annInput.value.trim();
                if (!msg) { toast('請輸入皇榜內容！', 'warn'); return; }

                let isDev = (selectedTier === 9);
                if (!isDev) {
                    if (window.playerSilver < selectedCost) {
                        toast('銀兩不足！目前當前餘額：' + window.playerSilver, 'danger');
                        return;
                    }
                }

                // 扣費與存檔
                if (selectedCost > 0) window.playerSilver -= selectedCost;
                
                const record = { 
                    text: msg, 
                    isDev: isDev, 
                    tier: isDev ? 'dev' : selectedTier, 
                    time: Date.now() 
                };
                
                let saved = JSON.parse(localStorage.getItem('hua_announcements') || '[]');
                
                if (isDev) {
                    // 若是開發者，踢掉舊的開發者公告
                    const devIdx = saved.findIndex(x => x.isDev);
                    if (devIdx > -1) saved.splice(devIdx, 1);
                    saved.unshift(record);
                } else {
                    // 玩家公告加在開頭，但不能超過開發者
                    const pList = saved.filter(x => !x.isDev);
                    pList.unshift(record);
                    saved = saved.filter(x => x.isDev).concat(pList);
                }

                localStorage.setItem('hua_announcements', JSON.stringify(saved));
                renderAnnouncements();
                _saveCollection();
                _updateHUD();
                
                annModal.classList.add('hidden');
                toast(isDev ? '🚀 開發者最高旨意已下達！' : `🎉 皇榜發布成功！`, 'success');
            };
        }

        const btnDevConfirm = document.getElementById('btn-dev-announce-confirm');
        if (btnDevConfirm) {
            btnDevConfirm.onclick = () => {
                const msgInput = document.getElementById('dev-announce-input');
                const msg = msgInput ? msgInput.value.trim() : '';
                if (!msg) { toast('請輸入系統旨意內容！', 'warn'); return; }

                const record = { 
                    text: msg, 
                    isDev: true, 
                    tier: 'dev', 
                    time: Date.now() 
                };
                
                let saved = JSON.parse(localStorage.getItem('hua_announcements') || '[]');
                // 若是開發者，踢掉舊的開發者公告
                const devIdx = saved.findIndex(x => x.isDev);
                if (devIdx > -1) saved.splice(devIdx, 1);
                saved.unshift(record);

                localStorage.setItem('hua_announcements', JSON.stringify(saved));
                renderAnnouncements();
                
                window.closeDevModal();
                toast('🚀 開發者最高旨意已下達！', 'success');
            };
        }
        renderAnnouncements();
    }

    // 渲染聊天室頂端的 4 格公告欄
    function renderAnnouncements() {
        const board = document.getElementById('chat-announce-board');
        if (!board) return;
        
        const saved = JSON.parse(localStorage.getItem('hua_announcements') || '[]');
        let html = '';
        
        const devAnn = saved.find(x => x.isDev);
        const playerAnns = saved.filter(x => !x.isDev).slice(0, 3); // 玩家最多 3 個
        
        if (devAnn) {
            html += `<div class="announce-msg ann-dev">👑【系統詔書】 ${_escHtml(devAnn.text)}</div>`;
        }

        playerAnns.forEach(ann => {
            const tClass = ann.tier === 3 ? 'ann-tier1' : (ann.tier === 2 ? 'ann-tier2' : 'ann-tier3');
            const prefix = ann.tier === 3 ? '🌟' : (ann.tier === 2 ? '✨' : '💬');
            html += `<div class="announce-msg ${tClass}">${prefix} ${_escHtml(ann.text)}</div>`;
        });
        
        if (!html) html = '<div style="color:#666; font-size:12px; text-align:center;">目前天下太平，尚無皇榜</div>';
        board.innerHTML = html;
        
        const btnPublish = document.getElementById('btn-publish-board');
        if (btnPublish) {
            btnPublish.textContent = '發布皇榜 - 當前餘額: ' + window.playerSilver;
        }
    }

    // 渲染排行榜頁面（真實 PvP 連勝紀錄）
    function renderLeaderboard() {
        const board     = document.getElementById('leaderboard-list');
        const streakVal = document.getElementById('my-current-streak');
        const bestVal   = document.getElementById('my-best-streak');
        if (!board) return;

        // 個人當前數據
        const curr = parseInt(localStorage.getItem('hua_current_streak') || '0');
        const best = parseInt(localStorage.getItem('hua_best_streak')    || '0');
        if (streakVal) streakVal.textContent = curr;
        if (bestVal)   bestVal.textContent   = best;

        // 讀取所有玩家記錄，依最高連勝降冪排列
        let records = [];
        try {
            records = JSON.parse(localStorage.getItem('hua_leaderboard') || '[]');
        } catch (_) { records = []; }

        // 確保自己的最新紀錄也在榜中（若 best > 0 且尚未寫入）
        if (best > 0) {
            const myName = window.playerNickname || '無名英雄';
            const mine   = records.find(r => r.name === myName);
            if (!mine) {
                records.push({ name: myName, bestStreak: best, updatedAt: Date.now() });
                localStorage.setItem('hua_leaderboard', JSON.stringify(records));
            } else if (best > mine.bestStreak) {
                mine.bestStreak = best;
                mine.updatedAt  = Date.now();
                localStorage.setItem('hua_leaderboard', JSON.stringify(records));
            }
        }

        // 按最高連勝排序
        records.sort((a, b) => b.bestStreak - a.bestStreak);

        if (records.length === 0) {
            board.innerHTML = `
                <div style="color:#555; font-size:13px; text-align:center; padding:50px 20px; line-height:2;">
                    <div style="font-size:28px; margin-bottom:12px;">⚔️</div>
                    尚無 PvP 連勝紀錄<br>
                    <span style="font-size:11px;">與真實對手對戰並獲勝後，紀錄將出現於此</span>
                </div>`;
            return;
        }

        const medals = ['🥇','🥈','🥉'];
        const myName = window.playerNickname || '無名英雄';

        board.innerHTML = records.map((p, idx) => {
            const isMe    = p.name === myName;
            const rankBg  = idx === 0 ? 'rgba(212,175,55,0.18)' :
                            idx === 1 ? 'rgba(192,192,192,0.12)' :
                            idx === 2 ? 'rgba(205,127,50,0.12)'  : 'transparent';
            const rankBdr = idx === 0 ? '#d4af37' :
                            idx === 1 ? '#aaa'     :
                            idx === 2 ? '#cd7f32'  : '#2a2a2a';
            const meBorder = isMe ? '; box-shadow:0 0 0 2px var(--gold)' : '';
            const rankLabel = idx < 3 ? medals[idx] : `<span style="font-size:13px; font-weight:700; color:#666;">${idx + 1}</span>`;
            const date = p.updatedAt ? new Date(p.updatedAt).toLocaleDateString('zh-TW') : '';

            return `
            <div class="rank-item ${idx < 3 ? 'rank-' + (idx+1) : ''}"
                 style="background:${rankBg}; border-color:${rankBdr}${meBorder};">
                <div class="rank-pos">${rankLabel}</div>
                <div style="flex:1; margin-left:10px; min-width:0;">
                    <div style="color:${isMe ? 'var(--gold)' : '#eee'}; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${isMe ? '👤 ' : ''}${_escHtml(p.name)}
                    </div>
                    <div style="font-size:10px; color:#555; margin-top:2px;">${date}</div>
                </div>
                <div style="text-align:right; flex-shrink:0;">
                    <div style="font-size:22px; font-weight:900; color:${idx === 0 ? 'var(--gold)' : idx === 1 ? '#ccc' : idx === 2 ? '#cd7f32' : '#aaa'}; line-height:1;">
                        ${p.bestStreak}
                    </div>
                    <div style="font-size:10px; color:#555;">最高連勝</div>
                </div>
            </div>`;
        }).join('');
    }

    // 渲染皇榜歷史 (搬遷自青史冊)
    function renderAnnouncementsHistory() {
        const board = document.getElementById('announcement-history-list');
        if (!board) return;

        const saved = JSON.parse(localStorage.getItem('hua_announcements') || '[]');
        if (saved.length === 0) {
            board.innerHTML = '<div style="color:#666; font-size:12px; text-align:center; padding:40px;">目前天下太平，尚無皇榜</div>';
            return;
        }

        board.innerHTML = saved.map(ann => `
            <div style="background:rgba(212,175,55,0.05); border:1px solid #222; border-radius:8px; padding:12px; margin-bottom:10px; text-align:left; position:relative;">
                <div style="color:${ann.isDev ? '#9f7aea' : 'var(--gold)'}; font-size:11px; margin-bottom:5px;">
                    ${ann.isDev ? '🔱 系統詔旨' : (ann.tier === 3 ? '🥇 金榜' : (ann.tier === 2 ? '🥈 銀榜' : '🥉 銅榜'))}
                </div>
                <div style="color:#eee; font-size:14px; line-height:1.5;">${_escHtml(ann.text)}</div>
                <div style="font-size:10px; color:#444; margin-top:8px; text-align:right;">${new Date(ann.time).toLocaleString()}</div>
            </div>
        `).join('');
    }

    // ==============================================================
    // 點將出征與 Gacha (抽卡)
    // ==============================================================
    let pendingAction = null; // 'ai', 'create', 'join'
    let pendingJoinCode = null;

    function _openMonarchSelect(actionType, joinCode) {
        pendingAction = actionType;
        pendingJoinCode = joinCode;
        const modal = document.getElementById('monarch-select-modal');
        const list = document.getElementById('monarch-select-list');
        const btnConfirm = document.getElementById('btn-confirm-monarch');
        
        if(!modal || !list) return;
        
        const monarchs = window.cardDatabase ? window.cardDatabase.filter(c => c.type === '君王') : [];
        let html = '';
        monarchs.forEach(m => {
            const isOwned = window.playerOwnedCards.includes(m.id);
            const statusClass = isOwned ? 'card-owned' : 'card-unowned';
            const crystal = m.dynasty[0] || '👑';
            const artContent = (isOwned && m.img)
                ? `<div style="width:100%; height:120px; background-image:url('${m.img}'); background-size:cover; background-position:center; border-radius:8px; margin-bottom:15px; box-shadow:0 0 15px rgba(212,175,55,0.2);"></div>`
                : `<div style="font-size:60px; margin-bottom:15px; opacity:${isOwned ? 1 : 0.2}; filter: drop-shadow(0 0 10px rgba(255,255,255,0.1));">${crystal}</div>`;
            
            html += `
                <div class="monarch-card-btn ${statusClass}" data-id="${m.id}" data-owned="${isOwned}" style="width:100%; aspect-ratio:3/4; background:#111; border:2px solid ${isOwned ? 'var(--gold)' : '#222'}; border-radius:12px; cursor:${isOwned ? 'pointer' : 'default'}; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:15px; position:relative; overflow:hidden; transition: all 0.2s; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
                    ${artContent}
                    <div style="color:${isOwned ? 'var(--gold)' : '#333'}; font-weight:900; font-size:20px; letter-spacing:2px;">${m.name}</div>
                    <div style="font-size:14px; color:#555; margin-top:8px;">${m.dynasty} · 君王</div>
                    ${!isOwned ? '<div style="position:absolute; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; color:#555; font-weight:900; font-size:16px; pointer-events:none; letter-spacing:4px;">未 招 募</div>' : ''}
                </div>
            `;
        });
        list.innerHTML = html;
        window.selectedMonarchId = null;
        btnConfirm.disabled = true;

        const cards = list.querySelectorAll('.monarch-card-btn[data-owned="true"]');
        cards.forEach(c => c.addEventListener('click', function() {
            list.querySelectorAll('.monarch-card-btn').forEach(x => {
                x.style.transform = 'scale(1)';
                x.style.borderColor = x.getAttribute('data-owned') === 'true' ? 'var(--gold)' : '#333';
            });
            this.style.transform = 'scale(1.05)';
            this.style.borderColor = '#fff';
            window.selectedMonarchId = this.getAttribute('data-id');
            btnConfirm.disabled = false;
        }));

        modal.classList.remove('hidden');

        btnConfirm.onclick = () => {
            modal.classList.add('hidden');
            if (pendingAction === 'ai') {
                window.GAME_MODE = 'ai';
                _launchGame();
            } else if (pendingAction === 'create') {
                const code = Network.randomCode();
                Network.createRoom(code);
                _showWaitScreen(code, true);
                _startCountdown();
            } else if (pendingAction === 'join') {
                Network.joinRoom(pendingJoinCode);
                _showWaitScreen(pendingJoinCode, false);
            }
        };
    }

    // 點將臺 UI 邏輯
    function _setupGachaUI() {
        const btnOpen = document.getElementById('btn-gacha-open');
        const btnClose = document.getElementById('btn-gacha-close');
        const modal = document.getElementById('gacha-modal');
        const pool = document.getElementById('gacha-pool');
        const sidebar = modal ? modal.querySelector('.modal-sidebar') : null;
        
        if (!btnOpen || !modal) return;

        let _currentTitle = '📜 大華夏全武將圖鑑';
        let _currentMode = 'all'; // 'all' or specific type

        const _refreshGachaPool = (customTitle, filterType = 'all') => {
            _currentTitle = customTitle || _currentTitle;
            _currentMode = filterType;
            
            if (window.cardDatabase && pool) {
                const titleEl = document.getElementById('gacha-title');
                if (titleEl) titleEl.textContent = _currentTitle;
                
                let filtered = window.cardDatabase;
                if (filterType !== 'all') {
                    filtered = window.cardDatabase.filter(c => c.type === filterType);
                }

                let html = '';
                filtered.forEach(c => {
                    const isOwned = window.playerOwnedCards.includes(c.id);
                    const rarityColor = c.type === '君王' ? '#f1c40f' : (c.type === '大將軍' ? '#e74c3c' : '#bdc3c7');
                    const statusClass = isOwned ? 'card-owned' : 'card-unowned';
                    const glowClass = isOwned ? (c.type === '君王' ? 'glow-ssr' : (c.type === '大將軍' ? 'glow-sr' : '')) : '';
                    
                    const cardArtHtml = (isOwned && c.img)
                        ? `<div style="flex:1; width:100%; border-radius:4px; margin:5px 0; background-image:url('${c.img}'); background-size:cover; background-position:center;"></div>`
                        : `<div style="flex:1; width:100%; display:flex; align-items:center; justify-content:center; font-size:32px;">${isOwned ? '👤' : '🔒'}</div>`;

                    html += `
                        <div class="hero-card-item ${statusClass} ${glowClass}" 
                             data-id="${c.id}" 
                             data-owned="${isOwned}"
                             style="background:rgba(0,0,0,0.5); padding:10px; border-radius:8px; border:2px solid ${isOwned ? rarityColor : '#222'}; text-align:center; position:relative; display:flex; flex-direction:column; justify-content:space-between; transition:all 0.2s; cursor:${isOwned ? 'pointer' : 'default'}; overflow:hidden;">
                            <span style="color:${rarityColor}; font-size:10px; font-weight:bold; text-align:left;">[${c.type}]</span>
                            ${cardArtHtml}
                            <span style="font-size:14px; font-weight:bold; color: ${isOwned ? '#fff' : '#444'}">${c.name}</span>
                            <div style="font-size:9px; color:#555;">${isOwned ? c.dynasty : '尚未招募'}</div>
                            ${!isOwned ? '<div style="font-size:10px; color:#e74c3c; margin-top:5px; font-weight:900;">LOCKED</div>' : ''}
                        </div>
                    `;
                });
                
                if (filtered.length === 0) {
                    html = `<div style="grid-column: span 5; color:#555; padding:40px;">目前此分類尚無卡牌</div>`;
                }
                
                pool.innerHTML = html;

                // 綁定點擊事件以打開詳情
                pool.querySelectorAll('.hero-card-item').forEach(el => {
                    el.addEventListener('click', () => {
                        const id = el.getAttribute('data-id');
                        const isOwned = el.getAttribute('data-owned') === 'true';
                        if (isOwned) _openCardDetail(id);
                    });
                });
                
                // 更新進度條
                _updateCollectionProgress();
                
                // 更新銀兩顯示
                const silverVal = document.getElementById('gacha-silver-val');
                if (silverVal) silverVal.textContent = window.playerSilver;
                
                const lobbySilver = document.getElementById('lobby-silver-display');
                if (lobbySilver) lobbySilver.textContent = `💰 當前餘額: ${window.playerSilver} 兩`;
            }
        };

        // 切換模式：'recruit' (招募) 或 'gallery' (全圖鑑)
        const _setGachaMode = (mode) => {
            const sidebar = document.getElementById('gacha-sidebar');
            const controls = document.getElementById('gacha-controls-area');
            const titleEl = document.getElementById('gacha-title');
            const resDiv = document.getElementById('gacha-result');
            
            if (resDiv) resDiv.style.display = 'none'; // 切換模式時清理招募完成狀態

            if (mode === 'recruit') {
                if (sidebar) sidebar.style.display = 'none';
                if (controls) controls.style.display = 'flex';
                if (titleEl) titleEl.textContent = '天下點將臺';
                // 進入招募模式時，清空池子預覽或顯示簡單引導
                if (pool) pool.innerHTML = '<div style="grid-column: span 5; color:#555; padding:40px;">招募英雄，助我華夏大業！<br>(點擊左側進行招募)</div>';
                
                // 修正：進入招募模式時也需要刷新銀兩顯示
                const gv = document.getElementById('gacha-silver-val');
                if (gv) gv.textContent = window.playerSilver;
            } else {
                if (sidebar) sidebar.style.display = 'flex';
                if (controls) controls.style.display = 'none';
                if (titleEl) titleEl.textContent = '天下豪傑';
                // 重置篩選按鈕：回到「全部卡牌」並清除其他按鈕的 active
                const allFilterBtns = modal.querySelectorAll('.filter-btn');
                allFilterBtns.forEach(b => b.classList.remove('active'));
                const allBtn = modal.querySelector('.filter-btn[data-type="all"]');
                if (allBtn) allBtn.classList.add('active');
                _refreshGachaPool('天下豪傑');
            }
        };

        // 側邊欄篩選按鈕事件
        const filterBtns = modal.querySelectorAll('.filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                _refreshGachaPool('天下豪傑', btn.getAttribute('data-type'));
            });
        });

        window._openLibrary = () => {
             _setGachaMode('gallery');
             modal.classList.remove('hidden');
        };

        // 武將詳情
        const _openCardDetail = (cardId) => {
            const card = window.cardDatabase.find(c => c.id === cardId);
            if (!card) return;
            
            const ART_MAP = { '君王':'👑', '大將軍':'⚔️', '將軍':'🐎', '軍師':'📜', '計策':'✨', '突發事件':'⚡', '後勤':'🏛️', '內政':'🏮', '監察':'⚖️' };
            // 特定卡牌圖示
            const nameArtMap = { '火殺 (火)':'🔥', '雷殺 (雷)':'⚡', '水殺 (水)':'💧', '酒':'🍷', '南蠻入侵':'🛡', '萬箭齊發':'🏹', '桃園結義':'🍑', '五穀豐登':'🌾', '無中生有':'✨', '過河拆橋':'🌉', '順手牽羊':'🐑', '無懈可擊':'⚡' };
            
            document.getElementById('detail-card-name').textContent = card.name;
            const artEl = document.getElementById('detail-card-art');
            if (card.img) {
                artEl.innerHTML = `<img src="${card.img}" style="max-height:200px; max-width:100%; border-radius:8px; box-shadow:0 0 20px rgba(0,0,0,0.8); border:2px solid var(--gold);" />`;
            } else {
                const artIcon = nameArtMap[card.name] || ART_MAP[card.type] || '👑';
                artEl.innerHTML = `<div style="font-size:100px;">${artIcon}</div>`;
            }
            document.getElementById('detail-card-dynasty').textContent = `—— ${card.dynasty} ——`;
            
            const typeEl = document.getElementById('detail-card-type');
            typeEl.textContent = card.isBasic ? `基本卡 · ${card.type}` : card.type;
            const typeBg = {
                '君王':'#f1c40f', '大將軍':'#e74c3c', '將軍':'#c0392b',
                '軍師':'#2980b9', '計策':'#8e44ad', '突發事件':'#d35400',
                '後勤':'#27ae60', '內政':'#16a085', '監察':'#7f8c8d'
            };
            typeEl.style.backgroundColor = typeBg[card.type] || '#34495e';
            typeEl.style.color = card.type === '君王' ? '#000' : '#fff';
            
            document.getElementById('detail-card-desc').textContent = card.desc || '暫無簡介。';
            document.getElementById('detail-skill-name').textContent = card.skillName || '普通攻擊';
            document.getElementById('detail-skill-desc').textContent = card.skillDesc || '發起基礎進攻。';

            // 生平故事 / 歷史典故
            const storyContent = card.story || card.battleNote || '';
            const descBlock = document.getElementById('detail-card-desc').parentElement;
            // 移除舊有的故事區塊（避免重複）
            const oldStory = document.getElementById('detail-card-story-section');
            if (oldStory) oldStory.remove();
            // 有內容才注入
            if (storyContent) {
                const label = card.battleNote ? '⚔️ 歷史典故' : '📖 生平故事';
                const sec = document.createElement('div');
                sec.id = 'detail-card-story-section';
                sec.style.cssText = 'margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.08);';
                sec.innerHTML = `
                    <h4 style="color:#b8a060;margin-bottom:8px;font-size:13px;letter-spacing:1px;">${label}</h4>
                    <p style="color:#999;font-size:13px;line-height:1.9;white-space:pre-wrap;">${storyContent}</p>
                `;
                descBlock.appendChild(sec);
            }

            document.getElementById('card-detail-modal').classList.remove('hidden');
        };

        const _updateCollectionProgress = () => {
            if (!window.cardDatabase) return;
            const total = window.cardDatabase.filter(c => c.type !== '計策' && c.type !== '突發事件').length;
            const owned = window.playerOwnedCards.filter(id => {
                const c = window.cardDatabase.find(x => x.id === id);
                return c && c.type !== '計策' && c.type !== '突發事件';
            }).length;
            
            const percent = Math.floor((owned / total) * 100);
            const percentEl = document.getElementById('collection-percent');
            const countEl = document.getElementById('collection-count');
            if(percentEl) percentEl.textContent = percent + '%';
            if(countEl) countEl.textContent = `${owned}/${total}`;
        };

        // 隨機抽卡邏輯 (含稀有度與保底)
        let _pityCounter = parseInt(localStorage.getItem('hua_pity') || '0');
        // 首次十連抽保底旗標
        let _first10Done = localStorage.getItem('hua_first10_done') === '1';
        const doGacha = (times, cost, isFree = false, showWheel = true) => {
            if (!isFree && window.playerSilver < cost) {
                toast('銀兩不足！需要 ' + cost + ' 兩。', 'danger');
                _updateHUD();
                return;
            }
            if (!isFree) window.playerSilver -= cost;
            _updateHUD();

            if (!showWheel) {
                _showGachaResults(times);
                return;
            }

            // 直接進入時鐘式抽卡演出
            _showGachaResults(times);
        };

        const _showGachaResults = (times) => {
            const resData = [];
            const db = window.cardDatabase;

            // ── 首次十連抽保底：8種類型各一張 + 2張隨機 ──
            if (times === 10 && !_first10Done) {
                _first10Done = true;
                localStorage.setItem('hua_first10_done', '1');
                _pityCounter = 0;
                localStorage.setItem('hua_pity', '0');

                const _pick = (type) => {
                    const pool = db.filter(c => c.type === type);
                    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
                };
                // 8 種保底
                const guaranteed = ['君王','大將軍','將軍','軍師','後勤','監察','計策','突發事件']
                    .map(t => _pick(t))
                    .filter(Boolean);
                // 補足到10張（隨機）
                while (guaranteed.length < 10) {
                    guaranteed.push(db[Math.floor(Math.random() * db.length)]);
                }
                // 洗牌
                for (let i = guaranteed.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [guaranteed[i], guaranteed[j]] = [guaranteed[j], guaranteed[i]];
                }
                resData.push(...guaranteed);
            } else {
                // ── 一般抽卡邏輯（含保底）──
                for(let i=0; i<times; i++) {
                    _pityCounter++;
                    let pool = [];
                    let rand = Math.random();

                    // 保底邏輯：每10抽必得大將軍或以上
                    if (_pityCounter >= 10) {
                        _pityCounter = 0;
                        pool = db.filter(c => c.type === '君王' || c.type === '大將軍');
                    } else if (rand < 0.05) { // 5% 君王
                        pool = db.filter(c => c.type === '君王');
                    } else if (rand < 0.25) { // 20% 大將軍
                        pool = db.filter(c => c.type === '大將軍');
                    } else { // 75% 其他
                        pool = db.filter(c => c.type !== '君王' && c.type !== '大將軍' && c.type !== '計策' && c.type !== '突發事件');
                    }

                    if (pool.length === 0) pool = db;
                    resData.push(pool[Math.floor(Math.random() * pool.length)]);
                }
                localStorage.setItem('hua_pity', _pityCounter);
            }

            // 更新收集庫與重複返還機制
            let silverGained = 0;
            resData.forEach(c => {
                if (!window.playerOwnedCards.includes(c.id)) {
                    window.playerOwnedCards.push(c.id);
                    c.isDuplicate = false;
                } else {
                    c.isDuplicate = true;
                    if (c.type === '君王') silverGained += 100;
                    else if (c.type === '大將軍') silverGained += 50;
                    else silverGained += 10;
                }
            });
            
            if (silverGained > 0) {
                window.playerSilver += silverGained;
                setTimeout(() => toast(`抽到重複卡牌，自動轉化為 ${silverGained} 銀兩！`, 'success', 3000), 500);
            }
            _saveCollection();
            _refreshGachaPool();

            // 翻牌格式逐張揭示
            _runGridReveal(resData, times);
        };

        // ══════════════════════════════════════════
        //  5×2 翻牌式抽卡演出
        // ══════════════════════════════════════════
        const _runGridReveal = (resData, times) => {
            const _CE  = { '君王':'👑','大將軍':'⚔️','將軍':'🐎','軍師':'📜',
                           '後勤':'🌾','內政':'🏛️','監察':'👁️','計策':'✨','突發事件':'🌩️' };
            const _rc  = c => c.type==='君王'?'ssr':c.type==='大將軍'?'sr':'r';
            const _col = c => c.type==='君王'?'#f1c40f':c.type==='大將軍'?'#e74c3c':'#bdc3c7';

            // ── 建立每張卡的 HTML ──────────────────────────────────
            const cardsHtml = resData.map((c, i) => {
                const rc  = _rc(c);
                const col = _col(c);

                // 正面內容：有圖片就顯示圖片，否則顯示類型樣式
                let frontInner;
                if (c.img) {
                    frontInner = `<img class="ggc-art" src="${c.img}" alt="${c.name}">`;
                } else {
                    const bg = c.type==='君王'   ? 'linear-gradient(160deg,#4a3200,#b8860b,#4a3200)'
                             : c.type==='大將軍' ? 'linear-gradient(160deg,#4a0000,#c0392b,#4a0000)'
                             :                     'linear-gradient(160deg,#111a30,#2c3e60,#111a30)';
                    frontInner = `
                        <div class="ggc-no-art" style="background:${bg};">
                            <div class="ggc-no-art-icon">${_CE[c.type]||'✦'}</div>
                            <div class="ggc-no-art-name">${c.name}</div>
                            <div class="ggc-no-art-type">${c.dynasty}</div>
                        </div>`;
                }

                return `
                    <div class="ggc-card ggc-${rc}" data-idx="${i}">
                        <div class="ggc-inner">
                            <div class="ggc-back">
                                <div class="ggc-back-body">
                                    <div class="ggc-back-char">華</div>
                                    <div class="ggc-back-sub">夏風雲錄</div>
                                </div>
                            </div>
                            <div class="ggc-front">
                                ${frontInner}
                                <div class="ggc-label">
                                    <span class="ggc-lname" style="color:${col};">${c.name}</span>
                                    <span class="ggc-ltype">${_CE[c.type]||''} ${c.type}</span>
                                </div>
                                ${c.isDuplicate ? '<div class="ggc-dup">重複+銀兩</div>' : ''}
                            </div>
                        </div>
                    </div>`;
            }).join('');

            // ── 建立覆蓋層 ────────────────────────────────────────
            const ov = document.createElement('div');
            ov.id = 'gacha-grid';
            ov.innerHTML = `
                <button id="ggc-skip">⚡ 跳過</button>
                <div id="ggc-title">抽卡結果</div>
                <div id="ggc-grid">${cardsHtml}</div>
                <button id="ggc-confirm" style="display:none;">✅ 確認收編（共 ${times} 位）</button>
            `;
            document.body.appendChild(ov);

            const cards   = [...ov.querySelectorAll('.ggc-card')];
            const skipBtn = ov.querySelector('#ggc-skip');
            const confBtn = ov.querySelector('#ggc-confirm');

            // ── 翻開單張牌 ────────────────────────────────────────
            const _flip = (idx, cb) => {
                if (idx >= cards.length) { cb && cb(); return; }
                const card = cards[idx];
                card.classList.add('ggc-flipped');

                // 高稀有度閃光
                const c = resData[idx];
                if (c.type === '君王' || c.type === '大將軍') {
                    const fl = document.createElement('div');
                    fl.className = `gc-flash gc-flash-${_rc(c)}`;
                    ov.appendChild(fl);
                    setTimeout(() => fl.remove(), 900);
                }
                cb && setTimeout(cb, c.type==='君王' ? 800 : 480);
            };

            // ── 連續逐張翻開 ─────────────────────────────────────
            const _flipSeq = (i) => {
                if (i >= cards.length) {
                    skipBtn.style.display = 'none';
                    confBtn.style.display = 'block';
                    return;
                }
                _flip(i, () => _flipSeq(i + 1));
            };

            // ── 跳過：全部瞬間翻開 ───────────────────────────────
            skipBtn.onclick = () => {
                cards.forEach(c => c.classList.add('ggc-flipped'));
                skipBtn.style.display = 'none';
                confBtn.style.display = 'block';
            };

            // ── 確認關閉 ─────────────────────────────────────────
            confBtn.onclick = () => {
                ov.style.opacity = '0';
                ov.style.transition = 'opacity 0.5s';
                setTimeout(() => { ov.remove(); _saveCollection(); _updateHUD(); }, 500);
            };

            // 短暫停頓後開始翻牌
            setTimeout(() => _flipSeq(0), 500);
        };

        window._triggerStartingGift = () => {
            _showError('📜 檢測到新主公駕到，特賜「1000銀兩」祝您大展宏圖！招募天下英雄吧！');
            window.playerSilver = 1000;
            _saveCollection();
            _updateHUD();
        };

        const btnSingle = document.getElementById('btn-gacha-single');
        const btnTen = document.getElementById('btn-gacha-ten');
        const btnTwentyFive = document.getElementById('btn-gacha-twenty-five');
        
        if (btnSingle) btnSingle.onclick = () => doGacha(1, 50);
        if (btnTen) btnTen.onclick = () => doGacha(10, 500);
        if (btnTwentyFive) btnTwentyFive.onclick = () => doGacha(25, 1200);

        // 恢復遺漏的開關監聽器
        if (btnOpen) {
            btnOpen.addEventListener('click', () => {
                _setGachaMode('recruit');
                modal.classList.remove('hidden');
            });
        }
        if (btnClose) {
            btnClose.addEventListener('click', () => modal.classList.add('hidden'));
        }
        const btnPoolView = document.getElementById('btn-gacha-pool-view');
        if (btnPoolView) {
            btnPoolView.addEventListener('click', () => {
                _setGachaMode('gallery');
            });
        }
    }

    function _updateHUD() {
        const HUD_ELS = {
            'lobby-silver-display': '💰 當前餘額: ' + window.playerSilver + ' 兩',
            'gacha-silver-val': window.playerSilver,
            'btn-publish-board': '發布皇榜 - 當前餘額: ' + window.playerSilver
        };
        for (const [id, val] of Object.entries(HUD_ELS)) {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        }
    }
    window._updateHUD = _updateHUD;

    // 啟動入口
    function init() {
        _setupLobbyButtons();
        _setupNetworkEvents();
        _setupSocialCenter();
        _setupGachaUI();
    }

    // ══════════════════════════════════════════
    //  大廳按鈕
    // ══════════════════════════════════════════
    function _setupLobbyButtons() {
        // VS AI
        document.getElementById('btn-vs-ai').addEventListener('click', () => {
            _openMonarchSelect('ai');
        });

        // 建立房間
        document.getElementById('btn-create-room').addEventListener('click', () => {
            if (typeof Peer === 'undefined') {
                _showError('網路不可用（請確認已連上網際網路）');
                return;
            }
            _openMonarchSelect('create');
        });

        // 加入房間
        document.getElementById('btn-join-room').addEventListener('click', _doJoin);

        // 取消等待
        document.getElementById('btn-cancel-wait').addEventListener('click', () => {
            _clearTimer();
            Network.destroy();
            _showLobbyScreen();
        });

        // 輸入框：強制大寫 & Enter 送出
        const input = document.getElementById('join-code-input');
        if (input) {
            input.addEventListener('input', (e) => {
                e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') _doJoin();
            });
        }
    }

    function _doJoin() {
        const code = (document.getElementById('join-code-input').value || '').trim().toUpperCase();
        if (code.length !== 5) { _showError('請輸入正確的 5 位房間碼！'); return; }
        if (typeof Peer === 'undefined') { _showError('網路掛了！請檢查網路連線後再試。'); return; }
        
        // 特殊指令：管理員進入 (輸入 admin + 超級管理員 Email 觸發聖旨)
        if (code === 'ADMIN') {
            _handleAdminLogin();
            return;
        }

        _openMonarchSelect('join', code);
    }

    /** 管理員登入邏輯 */
    function _handleAdminLogin() {
        const email = prompt('⚔️ 請輸入超級管理員驗證信箱：');
        const admins = ['linus622wang@gmail.com', 'yanbo970913@gmail.com'];
        if (admins.includes(email)) {
            _showError('📜 聖旨到！超級管理員身分已驗證。');
            _showSuperAdminEdict(email);
        } else {
            _showError('❌ 驗證失敗：您並非指定的超級管理員。');
        }
    }

    /** 顯示聖旨風格管理面板 */
    function _showSuperAdminEdict(email) {
        // 如果已存在則移除
        const old = document.getElementById('super-admin-panel');
        if (old) old.remove();

        const panel = document.createElement('div');
        panel.id = 'super-admin-panel';
        panel.className = 'admin-edict-style';
        panel.innerHTML = `
            <div class="edict-header">📜 華夏風雲 · 超級管理員</div>
            <div class="edict-body">
                <p>👤 權限授權：<b>${email}</b></p>
                <div class="admin-controls">
                    <button onclick="_adminAction('debug_mode')">🛠 開啟除錯模式</button>
                    <button onclick="_adminAction('all_cards')">🃏 解鎖全牌庫</button>
                    <button onclick="_adminAction('buff_hero')">⚡ 強化當前將領</button>
                    <button onclick="this.parentElement.parentElement.parentElement.remove()" style="background:#555">關閉</button>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
    }

    /** 管理員行為 (預留接口) */
    window._adminAction = function(type) {
        alert('【管理員指令】執行：' + type + ' (待對接 GAS 後端)');
    };

    // ══════════════════════════════════════════
    //  網路事件回調
    // ══════════════════════════════════════════
    function _setupNetworkEvents() {
        if (typeof Network === 'undefined') return;

        Network.on('room_ready', ({ code }) => {
            _setWaitStatus('房間已建立，等待對手加入...');
        });

        Network.on('peer_connected', ({ isHost }) => {
            _clearTimer();
            window.GAME_MODE = isHost ? 'host' : 'guest';
            _setWaitStatus(isHost ? '🎉 對手已連線！準備開戰...' : '🎉 成功加入房間！準備開戰...');
            document.getElementById('btn-cancel-wait').style.display = 'none';
            const cd = document.getElementById('wait-countdown-wrap');
            if (cd) cd.style.display = 'none';
            // 若遊戲已在進行（重連成功），主機重發狀態同步
            if (window.gameActive && isHost && typeof syncStateToGuest === 'function') {
                setTimeout(() => syncStateToGuest(false), 800);
                return;
            }
            setTimeout(_launchGame, 1800);
        });

        Network.on('reconnecting', ({ attempt, max }) => {
            if (window.gameActive && typeof toast === 'function') {
                toast(`🔄 連線中斷，嘗試重連 (${attempt}/${max})...`, 'warn', 3000);
            } else {
                _setWaitStatus(`🔄 連線中斷，嘗試重連 (${attempt}/${max})...`);
            }
        });

        Network.on('net_error', ({ message, type }) => {
            if (_isLaunching) return; // 正在啟動時，不要跳回大廳
            _clearTimer();
            Network.destroy();
            const MSGS = {
                'unavailable-id':   '此房間碼已被使用！請稍後重試或換一個房間碼',
                'peer-unavailable': '找不到此房間！請確認房間碼是否正確',
                'timeout':          '連線逾時！請確認對方是否已建立房間'
            };
            _showError(MSGS[type] || ('連線失敗：' + message));
            _showLobbyScreen();
        });

        Network.on('peer_disconnected', () => {
            if (window.gameActive) {
                // 遊戲進行中斷線 → 切換 AI 托管
                if (typeof toast === 'function') toast('⚠ 對手斷線！已切換為 AI 托管', 'warn', 4000);
                window.GAME_MODE = 'ai';
                if (window._pendingHostAttack) window._pendingHostAttack = null;
            } else {
                // 遊戲已結束，對方在結束畫面離開 → 踢回大廳
                const gs = document.getElementById('game-over-screen');
                if (gs && !gs.classList.contains('hidden')) {
                    if (typeof toast === 'function') toast('🚪 對手已離開房間，即將返回大廳…', 'warn', 3000);
                    setTimeout(() => {
                        if (gs) gs.classList.add('hidden');
                        _showLobbyScreen();
                    }, 2500);
                }
            }
        });

        // 接收聊天訊息
        Network.on('chat_msg', (text) => {
            if (window._appendChatMessage) {
                window._appendChatMessage(text, 'opponent');
            }
        });
    }

    // ══════════════════════════════════════════
    //  計時器
    // ══════════════════════════════════════════
    let _rematchMode = false; // 再配對模式：超時時詢問而非自動切 AI

    function _startCountdown(rematch = false) {
        _rematchMode = rematch;
        _seconds = 30;
        // 更新標題文字
        const labelEl = document.getElementById('wait-countdown-label');
        if (labelEl) labelEl.textContent = rematch ? '等待對手加入：' : '超時切換 AI：';
        // 確保超時對話框隱藏
        const dlg = document.getElementById('wait-timeout-dialog');
        if (dlg) dlg.classList.add('hidden');
        _renderCountdown();
        _timer = setInterval(() => {
            _seconds--;
            _renderCountdown();
            if (_seconds <= 0) {
                _clearTimer();
                if (_rematchMode) {
                    // 詢問玩家：繼續等 or 換 AI
                    _showTimeoutDialog();
                } else {
                    Network.destroy();
                    window.GAME_MODE = 'ai';
                    _setWaitStatus('⏱ 等待超時，切換為 AI 對戰！');
                    setTimeout(_launchGame, 1200);
                }
            }
        }, 1000);
    }

    function _showTimeoutDialog() {
        const dlg = document.getElementById('wait-timeout-dialog');
        if (dlg) dlg.classList.remove('hidden');
        _setWaitStatus('⌛ 尚未配對到對手...');

        const btnContinue = document.getElementById('btn-continue-wait');
        const btnSwitch   = document.getElementById('btn-switch-ai');

        if (btnContinue) btnContinue.onclick = () => {
            dlg.classList.add('hidden');
            _startCountdown(true); // 重新倒數 30 秒
        };
        if (btnSwitch) btnSwitch.onclick = () => {
            dlg.classList.add('hidden');
            _clearTimer();
            Network.destroy();
            window.GAME_MODE = 'ai';
            _setWaitStatus('⚔ 切換為 AI 對戰，即將開始...');
            setTimeout(_launchGame, 1000);
        };
    }

    function _clearTimer() {
        if (_timer) { clearInterval(_timer); _timer = null; }
    }

    function _renderCountdown() {
        const el = document.getElementById('wait-countdown');
        if (el) el.textContent = _seconds;
    }

    // ══════════════════════════════════════════
    //  UI 切換 (中央管理)
    // ══════════════════════════════════════════
    function _switchScreen(targetId) {
        const screens = [
            'intro-screen', 'lobby-screen', 'room-wait-screen', 
            'loading-screen', 'game-container'
        ];
        screens.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.add('hidden');
                el.classList.remove('visible');
                // 特殊處理 Loading Screen 的 display: flex
                if (id === 'loading-screen') el.style.display = 'none';
            }
        });

        const target = document.getElementById(targetId);
        if (target) {
            target.classList.remove('hidden');
            target.classList.add('visible');
            if (targetId === 'loading-screen') {
                target.style.display = 'flex';
                target.style.opacity = '1';
            }
        }
    }

    function _showWaitScreen(code, isHost) {
        _switchScreen('room-wait-screen');
        document.getElementById('wait-room-code').textContent = code;
        _setWaitStatus(isHost ? '等待對手加入...' : '正在連線中...');
        const cd = document.getElementById('wait-countdown-wrap');
        if (cd) cd.style.display = isHost ? 'flex' : 'none';
    }

    function _showLobbyScreen() {
        _switchScreen('lobby-screen');
        // 房間頻道：每場結束返回大廳時清除（下次切換到房間頻道會自動刷新）
        localStorage.removeItem('hua_chat_room');
    }

    function _setWaitStatus(msg) {
        const el = document.getElementById('wait-status');
        if (el) el.textContent = msg;
    }

    function _showError(msg) {
        const el = document.getElementById('lobby-error');
        if (!el) return;
        el.textContent = msg;
        el.classList.remove('hidden');
        setTimeout(() => el.classList.add('hidden'), 4000);
    }

    // ══════════════════════════════════════════
    //  啟動遊戲
    // ══════════════════════════════════════════
    function _launchGame() {
        _isLaunching = true;
        _switchScreen('loading-screen');

        runLoadingScreen().then(() => {
            initGame();
            setupEventListeners();
            window.gameActive = true;

            if (window.GAME_MODE === 'guest') {
                _setupGuestHandlers();
                if (typeof showHint === 'function') showHint('⏳ 等待主機同步遊戲資料...');
                if (typeof updateHUDs === 'function') updateHUDs();
            } else if (window.GAME_MODE === 'host') {
                _setupHostHandlers();
                startMyTurn();
            } else {
                // AI 模式
                startMyTurn();
            }
        });
    }

    // ══════════════════════════════════════════
    //  主機端：接收客方行動
    // ══════════════════════════════════════════
    function _setupHostHandlers() {
        Network.on('guest_action', (action) => _processGuestAction(action));
    }

    function _processGuestAction(action) {
        switch (action.type) {
            case 'deploy_char':    _guestDeployChar(action);    break;
            case 'spell':          _guestSpell(action);         break;
            case 'attack':         _guestAttack(action);        break;
            case 'heal':           _guestHeal(action);          break;
            case 'end_turn':       startMyTurn();               break;
            case 'defense_result': _guestDefenseResult(action); break;
            default:
                break; // 未知 guest_action 類型，忽略
        }
    }

    /** 客方部署人物牌 */
    function _guestDeployChar(action) {
        const { cardUid, cardData, target } = action;
        let idx  = oppHandData.findIndex(c => c.uid === cardUid);
        let card = (idx !== -1) ? oppHandData.splice(idx, 1)[0] : cardData;
        if (!card) { _sync(); return; }
        if (typeof initCharCard === 'function') initCharCard(card); // HP×100 + ATK/DEF

        let placed = false;
        if (target === 'active') {
            if (card.type === '君王' && oppBoard.active[2] === null) {
                oppBoard.active[2] = card; placed = true;
            } else {
                const si = oppBoard.active.findIndex((s, i) => s === null && i !== 2);
                if (si !== -1) { oppBoard.active[si] = card; placed = true; }
            }
        } else {
            const si = oppBoard.bench.findIndex(s => s === null);
            if (si !== -1) { oppBoard.bench[si] = card; placed = true; }
        }

        if (!placed) { oppHandData.push(card); }
        else         { toast(`🃏 對手部署 <b>${card.name}</b>！`, 'danger', 2000); }

        renderOppBoard();
        renderOppHandUI();
        _sync();
    }

    /** 客方使用計策 */
    function _guestSpell(action) {
        const { spellType, cardUid, targetZone, targetIdx } = action;
        const hi = oppHandData.findIndex(c => c.uid === cardUid);
        if (hi !== -1) {
            const removed = oppHandData.splice(hi, 1)[0];
            oppBoard.discard.push(removed);
        }

        if (spellType === '釜底抽薪' && targetZone) {
            const t = myBoard[targetZone] && myBoard[targetZone][targetIdx];
            if (t) {
                spawnSkillFx('🔥', getSlotEl('my-' + targetZone + '-zone', targetIdx));
                toast(`🔥 對手【釜底抽薪】！<b>${t.name}</b> 被破壞！`, 'danger');
                myBoard[targetZone][targetIdx] = null;
                myBoard.discard.push(t);
                renderBoard();
            }
        } else if (spellType === '草船借箭') {
            for (let i = 0; i < 2 && oppDeck.length > 0; i++) oppHandData.push(oppDeck.pop());
            toast('🏹 對手【草船借箭】抽了 2 張！', 'danger');
            renderOppHandUI();
        } else if (spellType === 'generic') {
            toast(`✨ 對手使用了 <b>${action.cardName || '計策'}</b>！`, 'danger');
        }

        _sync();
    }

    /** 客方發起攻擊（主機需顯示防禦對話框） */
    function _guestAttack(action) {
        const { targetZone, targetIdx } = action;
        const target = myBoard[targetZone] && myBoard[targetZone][targetIdx];
        if (!target) { _sync(); return; }

        const mods = execAttackMods(oppBoard);
        const { unDodgeable, ignoreFirstDodge, extraDmg, hasAoE, hasFireLianYing, hasFengLang } = mods;
        let dmg = 1 + extraDmg;
        if (unDodgeable)     toast('⚔ 對手鎖定技發動！此次攻擊無法閃避！', 'skill');
        if (ignoreFirstDodge) toast('⚔ 對手【水戰】— 您的第一張固守被無視！', 'skill');
        if (hasFengLang)      toast('🐺 對手【風狼】— 攻擊附帶額外效果！', 'skill');

        // AoE 傷害（火燒赤壁）
        if (hasAoE) {
            const tIdx = myBoard.active.indexOf(target);
            [-1, 1].forEach(offset => {
                const adj = myBoard.active[tIdx + offset];
                if (adj && adj.hp > 0) {
                    adj.hp = Math.max(0, adj.hp - 1);
                    toast(`🔥 【火燒赤壁】波及 <b>${adj.name}</b>！`, 'danger', 1800);
                    if (adj.hp <= 0) {
                        myBoard.active[tIdx + offset] = null;
                        myBoard.discard.push(adj);
                    }
                }
            });
            renderBoard();
            if (checkWinCondition()) return;
        }

        toast(`⚔ 對手突擊 <b>${target.name}</b>！`, 'danger', 2000);
        setTimeout(() => _hostDefenseVsGuest(target, targetZone, targetIdx, dmg, unDodgeable, ignoreFirstDodge), 600);
    }

    /** 主機端 — 顯示防禦 Modal（面對客方攻擊） */
    function _hostDefenseVsGuest(target, zone, idx, dmg, unDodgeable, ignoreFirstDodge = false) {
        const dodgeIdx = myHand.findIndex(c => c.name && c.name.includes('固守'));
        const spaceIdx = myHand.findIndex(c => c.name && c.name.includes('空城計'));
        const zhaoIdx  = (target.skillName === '龍膽')
            ? myHand.findIndex(c => c.name && c.name.includes('突擊')) : -1;
        const hasDodge = !unDodgeable && !ignoreFirstDodge && (dodgeIdx !== -1 || spaceIdx !== -1 || zhaoIdx !== -1);

        let dodgeLabel = '🛡 無防禦可用';
        let realIdx    = -1;
        if (hasDodge) {
            if (spaceIdx !== -1) { realIdx = spaceIdx; dodgeLabel = '🏯 空城計'; }
            else if (dodgeIdx !== -1) { realIdx = dodgeIdx; dodgeLabel = '🛡 固守閃避'; }
            else if (zhaoIdx !== -1)  { realIdx = zhaoIdx;  dodgeLabel = '🐉 龍膽'; }
        }

        openDefenseModal(
            `對手突擊 <b>${target.name}</b>！（傷害 ${dmg}）\n${unDodgeable ? '⚠️ 此次攻擊無法閃避！' : ''}`,
            dodgeLabel, '💥 硬扛',
            hasDodge ? () => {
                consumeHandCard(realIdx, myHand[realIdx]);
                spawnSkillFx('🛡', getSlotEl('my-' + zone + '-zone', idx));
                toast('🛡 成功閃避！', 'success');
                _sync();
            } : null,
            () => {
                const actualDmg = execDefenseMods(target, dmg);
                target.hp -= actualDmg;
                spawnDmgPopup(actualDmg, getSlotEl('my-' + zone + '-zone', idx));
                execDamageResponse(target, true);
                if (target.hp <= 0) {
                    target.hp = 0;
                    spawnSkillFx('💀', getSlotEl('my-' + zone + '-zone', idx));
                    toast(`💀 <b>${target.name}</b> 壯烈犧牲！`, 'danger', 3500);
                    myBoard[zone][idx] = null;
                    myBoard.discard.push(target);
                    const attacker = oppBoard.active.find(c => c !== null);
                    execOnKill(attacker, target, false);
                    renderBoard();
                    if (checkWinCondition()) return;
                } else {
                    toast(`💥 <b>${target.name}</b> 受到 ${actualDmg} 傷害 (${target.hp}/${target.maxHp})`, 'attack');
                    renderBoard();
                }
                _sync();
            }
        );
    }

    /** 客方治療自己的武將 */
    function _guestHeal(action) {
        const { targetZone, targetIdx } = action;
        const t = oppBoard[targetZone] && oppBoard[targetZone][targetIdx];
        if (t && t.hp < t.maxHp) {
            t.hp++;
            spawnDmgPopup(1, getSlotEl('opp-' + targetZone + '-zone', targetIdx), true);
            toast(`💚 對手的 <b>${t.name}</b> 恢復 1 HP！`, 'info', 2000);
            renderOppBoard();
        }
        _sync();
    }

    /** 客方防禦結果回報（針對主機彈出的 host_attacking 訊息） */
    function _guestDefenseResult(action) {
        const pending = window._pendingHostAttack;
        if (!pending) { _sync(); return; }
        window._pendingHostAttack = null;
        // 清除逾時計時器
        if (window._defenseTimeout) { clearTimeout(window._defenseTimeout); window._defenseTimeout = null; }

        const { card, zone, idx, dmg } = pending;

        if (action.result === 'dodge') {
            // 從 oppHandData 移除一張防禦卡
            const dIdx = oppHandData.findIndex(c =>
                c.name && (c.name.includes('固守') || c.name.includes('空城計') || c.name.includes('突擊')));
            if (dIdx !== -1) {
                const dc = oppHandData.splice(dIdx, 1)[0];
                oppBoard.discard.push(dc);
            }
            spawnSkillFx('🛡', getSlotEl('opp-' + zone + '-zone', idx));
            toast(`🛡 對手成功閃避！<b>${card.name}</b> 毫髮無傷`, 'info');
        } else {
            const actualDmg = execDefenseMods(card, dmg);
            card.hp -= actualDmg;
            spawnDmgPopup(actualDmg, getSlotEl('opp-' + zone + '-zone', idx));
            if (card.hp > 0) {
                toast(`🎯 命中！<b>${card.name}</b> 受到 ${actualDmg} 傷害！`, 'attack');
            } else {
                card.hp = 0;
                toast(`💀 對手 <b>${card.name}</b> 陣亡！`, 'danger', 3000);
                spawnSkillFx('💀', getSlotEl('opp-' + zone + '-zone', idx));
                oppBoard[zone][idx] = null;
                oppBoard.discard.push(card);
                const attacker = myBoard.active.find(c => c !== null);
                execOnKill(attacker, card, true);
                renderOppBoard();
                if (checkWinCondition()) return;
            }
            renderOppBoard();
        }
        _sync();
    }

    // ══════════════════════════════════════════
    //  客方端：接收主機狀態
    // ══════════════════════════════════════════
    function _setupGuestHandlers() {
        Network.on('state_sync', (state) => {
            if (typeof applyHostState === 'function') applyHostState(state);
        });

        Network.on('host_attacking', (data) => {
            _guestShowDefense(data);
        });

        Network.on('game_over', ({ winnerMsg }) => {
            if (typeof toast === 'function') toast(winnerMsg, 'gold', 5000);
            setTimeout(() => {
                if (typeof triggerGameOver === 'function') triggerGameOver(winnerMsg.includes('勝'));
            }, 2000);
        });
    }

    /** 客方 — 顯示防禦 Modal（主機主動攻擊時） */
    function _guestShowDefense(data) {
        const { targetZone, targetIdx, dmg, unDodgeable, ignoreFirstDodge = false, targetName } = data;
        const target = myBoard[targetZone] && myBoard[targetZone][targetIdx];

        const dodgeIdx = myHand.findIndex(c => c.name && c.name.includes('固守'));
        const spaceIdx = myHand.findIndex(c => c.name && c.name.includes('空城計'));
        const zhaoIdx  = (target && target.skillName === '龍膽')
            ? myHand.findIndex(c => c.name && c.name.includes('突擊')) : -1;
        const hasDodge = !unDodgeable && !ignoreFirstDodge && (dodgeIdx !== -1 || spaceIdx !== -1 || zhaoIdx !== -1);

        let dodgeLabel = '🛡 無防禦可用';
        let realIdx    = -1;
        if (hasDodge) {
            if (spaceIdx !== -1) { realIdx = spaceIdx; dodgeLabel = '🏯 空城計'; }
            else if (dodgeIdx !== -1) { realIdx = dodgeIdx; dodgeLabel = '🛡 固守閃避'; }
            else if (zhaoIdx !== -1)  { realIdx = zhaoIdx;  dodgeLabel = '🐉 龍膽'; }
        }

        openDefenseModal(
            `主機突擊 <b>${targetName || '您的武將'}</b>！（傷害 ${dmg}）\n${unDodgeable ? '⚠️ 此次攻擊無法閃避！' : ''}`,
            dodgeLabel, '💥 硬扛',
            hasDodge ? () => {
                consumeHandCard(realIdx, myHand[realIdx]);
                spawnSkillFx('🛡', getSlotEl('my-' + targetZone + '-zone', targetIdx));
                toast('🛡 成功閃避！', 'success');
                Network.send('guest_action', { type: 'defense_result', result: 'dodge' });
            } : null,
            () => {
                Network.send('guest_action', {
                    type: 'defense_result',
                    result: 'take',
                    targetZone,
                    targetIdx
                });
            }
        );
    }

    // ══════════════════════════════════════════
    //  共用：同步給客方
    //  (供 game.js 的主機端使用)
    // ══════════════════════════════════════════
    function _sync(isGuestTurn) {
        if (typeof syncStateToGuest === 'function') syncStateToGuest(isGuestTurn);
    }

    /** 防禦逾時時的自動硬扛（供 game.js 呼叫） */
    window._guestDefenseAutoTake = function () {
        const pending = window._pendingHostAttack;
        if (!pending) return;
        _guestDefenseResult({ result: 'take', targetZone: pending.zone, targetIdx: pending.idx });
    };

    /** 暴露給 game.js 呼叫的全域 syncStateToGuest */
    window.syncStateToGuest = function (isGuestTurn = false) {
        if (window.GAME_MODE !== 'host' || !Network.connected) return;
        Network.send('state_sync', {
            hostBoard:     { active: myBoard.active,  bench: myBoard.bench,  discard: myBoard.discard  },
            guestBoard:    { active: oppBoard.active, bench: oppBoard.bench, discard: oppBoard.discard },
            guestHand:     oppHandData,
            hostHandCount: myHand.length,
            hostDeckCount: myDeck.length,
            guestDeckCount: oppDeck.length,
            phase:         currentPhaseIndex,
            turnCount,
            isGuestTurn,
            gameActive:    !!window.gameActive
        });
    };

    // ══════════════════════════════════════════
    //  遊戲結束後的行動（由 game.js 呼叫）
    // ══════════════════════════════════════════

    /** 回到大廳（先斷線通知對方，再切換畫面）*/
    window._goToLobby = function() {
        const gs = document.getElementById('game-over-screen');
        if (gs) gs.classList.add('hidden');
        // 若仍有連線，先斷開 → 對方會收到 peer_disconnected 被踢回大廳
        if (typeof Network !== 'undefined' && Network.connected) {
            Network.destroy();
        }
        _showLobbyScreen();
    };

    /** AI 模式再玩一場 */
    window._rematchAi = function() {
        const gs = document.getElementById('game-over-screen');
        if (gs) gs.classList.add('hidden');
        window.GAME_MODE = 'ai';
        _launchGame();
    };

    /** 連線模式再玩一場：斷開舊連線 → 建立新房間 → 等待 30 秒（超時詢問）*/
    window._rematchOnline = function() {
        const gs = document.getElementById('game-over-screen');
        if (gs) gs.classList.add('hidden');
        // 先斷開舊連線（對方若未點再玩，會被踢到大廳）
        if (typeof Network !== 'undefined' && Network.connected) {
            Network.destroy();
        }
        // 短暫延遲讓 destroy 完成後再建新房
        setTimeout(() => {
            const code = Network.randomCode ? Network.randomCode() : Math.random().toString(36).slice(2,7).toUpperCase();
            Network.createRoom(code);
            _showWaitScreen(code, true);
            _startCountdown(true); // rematch 模式：超時詢問
        }, 400);
    };

})(); // end IIFE
