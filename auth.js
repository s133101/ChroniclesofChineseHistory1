// ============================================================
//  華夏風雲錄 — auth.js
//  帳號驗證系統（Firebase Realtime Database）
//  Copyright © 2026 linus622wang@gmail.com
// ============================================================
const Auth = (() => {
    'use strict';

    const FB   = 'https://chroniclesofchinesehistory1-default-rtdb.asia-southeast1.firebasedatabase.app';
    const EJ_SERVICE  = 'service_ATW5856LINUS';
    const EJ_NOTIFY   = 'template_ATW5856LINUS';   // 通知管理員（現有模板）
    const EJ_AUTHCODE = 'template_authcode';        // 驗證碼模板（需新建）
    const EJ_KEY      = '6pXEpXo8kr54GfzH0';
    const ADMIN_EMAIL = 'linus622wang@gmail.com';

    let _cur = null; // 目前已登入的使用者物件

    // ── SHA-256 雜湊密碼 ─────────────────────────────────────
    async function _hash(pwd) {
        const buf = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode('hua凌雲2026_' + pwd)
        );
        return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
    }

    // ── Firebase REST ────────────────────────────────────────
    async function _fbGet(path) {
        try {
            const r = await fetch(FB + path + '.json');
            return r.ok ? await r.json() : null;
        } catch { return null; }
    }
    async function _fbSet(path, data) {
        try {
            const r = await fetch(FB + path + '.json', {
                method: 'PUT',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify(data)
            });
            return r.ok; // Bug Fix #1：必須檢查 HTTP 狀態碼，Firebase 驗證失敗會回 400/401
        } catch { return false; }
    }
    async function _fbDel(path) {
        try {
            const r = await fetch(FB + path + '.json', {method:'DELETE'});
            return r.ok;
        } catch { return false; }
    }

    // ── sessionStorage 安全存取（Bug Fix #4：private mode 下會 throw）──
    function _saveSession(obj) {
        try { sessionStorage.setItem('hua_session', JSON.stringify(obj)); } catch {}
    }
    function _loadSession() {
        try { return JSON.parse(sessionStorage.getItem('hua_session') || 'null'); } catch { return null; }
    }

    // ── EmailJS 發信 ─────────────────────────────────────────
    function _sendEmail(templateId, params) {
        if (typeof emailjs === 'undefined') return;
        emailjs.send(EJ_SERVICE, templateId, params, EJ_KEY).catch(() => {});
    }

    // ── 初始化管理員帳號（首次執行）────────────────────────────
    async function initAdmin() {
        const existing = await _fbGet('/users/linus0622');
        if (!existing) {
            const hash = await _hash('ATW5856LINUS');
            await _fbSet('/users/linus0622', {
                password_hash: hash,
                email: ADMIN_EMAIL,
                role:  'admin',
                nickname: '最高管理員',
                avatar: null,
                createdAt: Date.now()
            });
        } else if (existing.nickname === '王') {
            // 修正之前誤設的名號，將「王」歸還給 wang 帳號
            const updated = {...existing, nickname: '最高管理員'};
            await _fbSet('/users/linus0622', updated);
        }

        // 建立開發者帳號 wang（若不存在）
        const devExisting = await _fbGet('/users/wang');
        if (!devExisting) {
            const devHash = await _hash('ATW5856LINUS');
            await _fbSet('/users/wang', {
                password_hash: devHash,
                email: ADMIN_EMAIL,
                role:  'developer',
                nickname: '王',
                avatar: null,
                createdAt: Date.now()
            });
        }
    }

    // ── 登入 Step 1：驗證帳密 ────────────────────────────────
    async function login(username, password) {
        const uname = username.toLowerCase().trim();
        if (!uname || !password) return {ok: false, err: '請填寫帳號與密碼'};

        // 🛡 防火牆：速率限制 + 封鎖檢查
        const _fw = window.HuaXiaSecurity;
        if (_fw) {
            if (_fw.isLoginBlocked(uname)) {
                const sec = _fw.getBlockRemaining(uname);
                return {ok: false, err: `帳號暫時鎖定中，請 ${Math.ceil(sec / 60)} 分鐘後再試`};
            }
            const rl = _fw.checkRate('login');
            if (!rl.allowed) {
                return {ok: false, err: `登入嘗試太頻繁，請稍後再試（本窗口已達上限）`};
            }
        }

        const user = await _fbGet('/users/' + uname);
        _fw?.logDbAccess('READ', '/users/' + uname, uname);

        if (!user) {
            // 帳號不存在 — 記錄為失敗登入 + 通知管理員
            _fw?.recordFailedLogin(uname);
            _sendEmail(EJ_NOTIFY, {
                action:     '⚠ 有人嘗試登入不存在的帳號：' + username,
                event_time: new Date().toLocaleString('zh-TW'),
                user_agent: navigator.userAgent
            });
            return {ok: false, err: '此帳號不存在，已通知管理員'};
        }

        const hash = await _hash(password);
        if (user.password_hash !== hash) {
            // 🛡 記錄失敗登入 / 觸發暴力破解偵測
            const bf = _fw?.recordFailedLogin(uname);
            if (bf?.blocked) return {ok: false, err: `密碼錯誤次數過多，帳號已鎖定 5 分鐘`};
            return {ok: false, err: '密碼錯誤，請再試一次'};
        }

        // 🛡 登入成功 — 清除失敗計數
        _fw?.recordSuccessLogin(uname);

        // 發送驗證碼
        const code    = String(Math.floor(100000 + Math.random() * 900000));
        const expires = Date.now() + 5 * 60 * 1000;
        const codeOk  = await _fbSet('/auth_codes/' + uname, {code, expires});
        _fw?.logDbAccess('WRITE', '/auth_codes/' + uname, uname);
        // Bug Fix #5：驗證碼寫入失敗時不寄信，直接報錯避免使用者收到無效碼
        if (!codeOk) return {ok: false, err: '伺服器暫時無法回應，請稍後再試'};

        _sendEmail(EJ_AUTHCODE, {
            to_email:  user.email,
            username:  user.nickname || uname,
            auth_code: code
        });

        return {ok: true, needCode: true, username: uname,
                emailHint: user.email.replace(/(.{2}).+(@.+)/, '$1***$2')};
    }

    // ── 登入 Step 2：驗證驗證碼 ──────────────────────────────
    async function verifyCode(username, code) {
        const uname  = username.toLowerCase().trim();

        // Bug Fix #3：加上驗證碼速率限制，防止暴力破解 6 位數碼
        const _fw2 = window.HuaXiaSecurity;
        if (_fw2) {
            const rl = _fw2.checkRate('verify');
            if (!rl.allowed) return {ok: false, err: '驗證碼嘗試太頻繁，請稍後再試'};
        }

        const stored = await _fbGet('/auth_codes/' + uname);
        window.HuaXiaSecurity?.logDbAccess('READ', '/auth_codes/' + uname, uname);

        if (!stored)                     return {ok: false, err: '驗證碼不存在，請重新登入'};
        if (stored.expires < Date.now()) return {ok: false, err: '驗證碼已過期，請重新登入'};
        if (stored.code !== code.trim()) {
            window.HuaXiaSecurity?.recordEvent('warn', 'auth', `帳號 ${uname} 驗證碼錯誤`);
            return {ok: false, err: '驗證碼錯誤，請再試一次'};
        }

        await _fbDel('/auth_codes/' + uname);
        window.HuaXiaSecurity?.logDbAccess('DELETE', '/auth_codes/' + uname, uname);

        const user = await _fbGet('/users/' + uname);
        window.HuaXiaSecurity?.logDbAccess('READ', '/users/' + uname, uname);

        // Bug Fix #2：user 為 null 時若繼續執行，_cur 會是殘缺物件導致後續所有操作崩潰
        if (!user) {
            try { sessionStorage.removeItem('hua_session'); } catch {}
            return {ok: false, err: '帳號資料讀取失敗，請重新登入'};
        }

        _cur = {...user, username: uname};

        // Bug Fix #4：改用安全的 _saveSession 避免 private mode 拋出 SecurityError
        _saveSession({
            username: uname,
            nickname: _cur.nickname || uname,
            role:     _cur.role,
            avatar:   _cur.avatar || null
        });

        return {ok: true, user: _cur};
    }

    // ── 更改密碼 ─────────────────────────────────────────────
    async function changePassword(oldPwd, newPwd) {
        if (!_cur) return {ok: false, err: '尚未登入'};

        const oldHash = await _hash(oldPwd);
        if (_cur.password_hash !== oldHash) return {ok: false, err: '舊密碼錯誤'};

        const newHash = await _hash(newPwd);
        const updated = {..._cur};
        delete updated.username;
        updated.password_hash = newHash;

        const ok = await _fbSet('/users/' + _cur.username, updated);
        if (!ok) return {ok: false, err: '密碼更新失敗，請稍後再試'};
        _cur.password_hash = newHash;
        return {ok: true};
    }

    // ── 更新頭像 ─────────────────────────────────────────────
    async function updateAvatar(dataUrl) {
        if (!_cur) return {ok: false, err: '尚未登入'};

        const updated = {..._cur};
        delete updated.username;
        updated.avatar = dataUrl;

        const ok = await _fbSet('/users/' + _cur.username, updated);
        if (!ok) return {ok: false, err: '頭像更新失敗，請稍後再試'};
        _cur.avatar = dataUrl;

        // Bug Fix #4(updateAvatar)：改用安全輔助函式
        const s = _loadSession() || {};
        s.avatar = dataUrl;
        _saveSession(s);

        return {ok: true, avatar: dataUrl};
    }

    // ── 隨機暱稱池 ───────────────────────────────────────────
    const _nicknamePool = [
        '無名大將','草莽英雄','天涯俠客','亂世豪傑','江湖遊俠','蕭何再世',
        '廟堂謀士','邊關猛將','江東霸主','北疆守護','鐵騎先鋒','謀定後動',
        '縱橫四海','定鼎天下','金戈鐵馬','運籌帷幄','橫刀立馬','揮斥方遒',
        '滄海一粟','龍騰虎躍','羽扇綸巾','臥龍鳳雛','沙場老將','青衫仗劍'
    ];
    function _randomNickname() {
        return _nicknamePool[Math.floor(Math.random() * _nicknamePool.length)];
    }

    // ── 自行註冊 ──────────────────────────────────────────────
    async function register(username, email, password, confirmPassword) {
        const uname = username.toLowerCase().trim();
        if (!uname || !email || !password) return {ok: false, err: '請填寫所有欄位'};
        if (!/^[a-z0-9_]{3,20}$/.test(uname))
            return {ok: false, err: '帳號只能用英文小寫、數字、底線（3–20字元）'};
        if (!email.includes('@')) return {ok: false, err: '請輸入有效的信箱'};
        if (password.length < 6) return {ok: false, err: '密碼至少 6 個字元'};
        if (password !== confirmPassword) return {ok: false, err: '兩次密碼不一致'};

        // 🛡 防火牆：速率限制
        const _fw = window.HuaXiaSecurity;
        if (_fw) {
            const rl = _fw.checkRate('register');
            if (!rl.allowed) return {ok: false, err: '註冊請求太頻繁，請稍後再試'};
        }

        const exist = await _fbGet('/users/' + uname);
        _fw?.logDbAccess('READ', '/users/' + uname, uname);
        if (exist) return {ok: false, err: '此帳號已被使用，請換一個'};

        const hash = await _hash(password);
        const nickname = _randomNickname();

        // Bug Fix #1(register)：檢查帳號寫入是否成功
        const userOk = await _fbSet('/users/' + uname, {
            password_hash: hash,
            email,
            role: 'player',
            nickname,
            avatar: null,
            createdAt: Date.now()
        });
        _fw?.logDbAccess('WRITE', '/users/' + uname, uname);
        if (!userOk) return {ok: false, err: '帳號建立失敗，請稍後再試'};
        _fw?.logOps(`新帳號註冊：${uname}（暱稱：${nickname}）`);

        // 發送驗證碼
        const code    = String(Math.floor(100000 + Math.random() * 900000));
        const expires = Date.now() + 5 * 60 * 1000;
        // Bug Fix #5(register)：驗證碼寫入失敗時不寄信，直接報錯
        const codeOk  = await _fbSet('/auth_codes/' + uname, {code, expires});
        _fw?.logDbAccess('WRITE', '/auth_codes/' + uname, uname);
        if (!codeOk) return {ok: false, err: '伺服器暫時無法回應，請稍後再試'};

        _sendEmail(EJ_AUTHCODE, {
            to_email:  email,
            username:  nickname,
            auth_code: code
        });

        return {ok: true, needCode: true, username: uname, nickname,
                emailHint: email.replace(/(.{2}).+(@.+)/, '$1***$2')};
    }

    // ── 查詢名號是否已被使用 ──────────────────────────────────
    async function checkNickname(nickname) {
        const name = nickname.trim();
        const users = await _fbGet('/users');
        if (!users) return true; // 查不到資料視為可用
        const currentUsername = _cur ? _cur.username : null;
        for (const [uname, data] of Object.entries(users)) {
            if (uname === currentUsername) continue; // 跳過自己
            if (data.nickname && data.nickname === name) return false; // 已被使用
        }
        return true; // 可使用
    }

    // ── 更新名號 ──────────────────────────────────────────────
    async function updateNickname(newNickname) {
        if (!_cur) return {ok: false, err: '尚未登入'};
        const name = newNickname.trim();
        if (!name) return {ok: false, err: '名號不能為空'};

        const updated = {..._cur};
        delete updated.username;
        updated.nickname = name;

        const ok = await _fbSet('/users/' + _cur.username, updated);
        if (!ok) return {ok: false, err: '名號更新失敗，請稍後再試'};
        _cur.nickname = name;

        // Bug Fix #4(updateNickname)：改用安全輔助函式
        const s = _loadSession() || {};
        s.nickname = name;
        _saveSession(s);

        return {ok: true};
    }

    // ── 更新留言 ──────────────────────────────────────────────
    async function updateMessage(text) {
        if (!_cur) return {ok: false, err: '尚未登入'};
        const updated = {..._cur};
        delete updated.username;
        updated.message = text.trim();
        const ok = await _fbSet('/users/' + _cur.username, updated);
        if (!ok) return {ok: false, err: '留言更新失敗，請稍後再試'};
        _cur.message = text.trim();
        return {ok: true};
    }

    // ── 更新信箱 ──────────────────────────────────────────────
    async function updateEmail(newEmail) {
        if (!_cur) return {ok: false, err: '尚未登入'};
        if (!newEmail || !newEmail.includes('@')) return {ok: false, err: '請輸入有效的信箱'};

        const updated = {..._cur};
        delete updated.username;
        updated.email = newEmail;

        const ok = await _fbSet('/users/' + _cur.username, updated);
        if (!ok) return {ok: false, err: '信箱更新失敗，請稍後再試'};
        _cur.email = newEmail;

        // Bug Fix #4(updateEmail)：改用安全輔助函式
        const s = _loadSession() || {};
        s.email = newEmail;
        _saveSession(s);

        return {ok: true};
    }

    // ── 管理員建立帳號 ────────────────────────────────────────
    async function adminCreateUser(username, password, email, nickname, role = 'player') {
        if (!_cur || _cur.role !== 'admin') return {ok: false, err: '需要管理員權限'};

        const uname = username.toLowerCase().trim();
        const exist = await _fbGet('/users/' + uname);
        if (exist) return {ok: false, err: '帳號已存在'};

        const hash = await _hash(password);
        await _fbSet('/users/' + uname, {
            password_hash: hash,
            email: email || '',
            role,
            nickname: nickname || _randomNickname(),
            avatar: null,
            createdAt: Date.now()
        });
        return {ok: true};
    }

    // ── Session 管理 ─────────────────────────────────────────
    function getSession() {
        const s = _loadSession();
        return (s && s.username) ? s : null;
    }

    async function restoreSession() {
        const s = getSession();
        if (!s) return null;
        const user = await _fbGet('/users/' + s.username);
        if (!user) { try { sessionStorage.removeItem('hua_session'); } catch {} return null; }
        _cur = {...user, username: s.username};
        return _cur;
    }

    function logout() {
        _cur = null;
        try { sessionStorage.removeItem('hua_session'); } catch {}
    }

    function current() { return _cur; }

    // ── 記錄一場對戰結果（同步 Firebase stats + battle_records）────
    async function recordBattle(mode, win, opponentName, rounds, silver) {
        if (!_cur) return;
        const uname = _cur.username;

        // 讀取最新使用者資料
        const user = await _fbGet('/users/' + uname);
        if (!user) return;

        const s = user.stats || { wins:0, losses:0, aiWins:0, bestStreak:0, currentStreak:0, totalGames:0 };
        const isPvP = mode === 'host' || mode === 'guest';
        s.totalGames = (s.totalGames || 0) + 1;

        if (win) {
            if (isPvP) {
                s.wins = (s.wins || 0) + 1;
                s.currentStreak = (s.currentStreak || 0) + 1;
                if (s.currentStreak > (s.bestStreak || 0)) s.bestStreak = s.currentStreak;
            } else {
                s.aiWins = (s.aiWins || 0) + 1;
            }
        } else if (isPvP) {
            s.losses = (s.losses || 0) + 1;
            s.currentStreak = 0;
        }

        const updated = {...user, stats: s};
        await _fbSet('/users/' + uname, updated);
        _cur = {..._cur, stats: s};

        // 對戰記錄（最多保留 20 筆）
        const history = await _fbGet('/battle_records/' + uname) || [];
        history.unshift({
            result:   win ? 'win' : 'lose',
            mode:     isPvP ? 'pvp' : 'ai',
            opponent: opponentName || (isPvP ? '未知對手' : 'AI 對手'),
            rounds:   rounds || 0,
            silver:   silver || 0,
            time:     Date.now()
        });
        if (history.length > 20) history.splice(20);
        await _fbSet('/battle_records/' + uname, history);
    }

    // ── 取得對戰記錄 ─────────────────────────────────────────────
    async function getBattleHistory() {
        if (!_cur) return [];
        return await _fbGet('/battle_records/' + _cur.username) || [];
    }

    // ── 密碼驗證（不觸發驗證碼流程，供管理員密碼核對用）──────────
    async function verifyPassword(username, password) {
        const uname = username.toLowerCase().trim();
        const user  = await _fbGet('/users/' + uname);
        if (!user || !user.password_hash) return false;
        const hash = await _hash(password);
        return user.password_hash === hash;
    }

    // ── 取得全服排行榜資料 ────────────────────────────────────────
    async function getLeaderboardData() {
        window.HuaXiaSecurity?.logDbAccess('READ', '/users (全服排行榜)', _cur?.username || 'guest');
        const users = await _fbGet('/users');
        if (!users) return [];
        return Object.entries(users)
            .filter(([, u]) => u.stats && ((u.stats.wins || 0) + (u.stats.losses || 0)) > 0)
            .map(([, u]) => {
                const w = u.stats.wins    || 0;
                const l = u.stats.losses  || 0;
                const total = w + l;
                return {
                    nickname:      u.nickname || '無名英雄',
                    wins:          w,
                    losses:        l,
                    winRate:       total > 0 ? Math.round(w / total * 100) : 0,
                    bestStreak:    u.stats.bestStreak    || 0,
                    currentStreak: u.stats.currentStreak || 0,
                    totalGames:    u.stats.totalGames    || 0
                };
            })
            .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate);
    }

    return {
        initAdmin,
        login,
        register,
        verifyCode,
        changePassword,
        updateAvatar,
        updateNickname,
        checkNickname,
        updateMessage,
        updateEmail,
        adminCreateUser,
        getSession,
        restoreSession,
        logout,
        current,
        recordBattle,
        getBattleHistory,
        getLeaderboardData,
        verifyPassword
    };
})();
