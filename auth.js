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
            await fetch(FB + path + '.json', {
                method: 'PUT',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify(data)
            });
            return true;
        } catch { return false; }
    }
    async function _fbDel(path) {
        try { await fetch(FB + path + '.json', {method:'DELETE'}); } catch {}
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

        const user = await _fbGet('/users/' + uname);

        if (!user) {
            // 帳號不存在，通知管理員
            _sendEmail(EJ_NOTIFY, {
                action:     '⚠ 有人嘗試登入不存在的帳號：' + username,
                event_time: new Date().toLocaleString('zh-TW'),
                user_agent: navigator.userAgent
            });
            return {ok: false, err: '此帳號不存在，已通知管理員'};
        }

        const hash = await _hash(password);
        if (user.password_hash !== hash) {
            return {ok: false, err: '密碼錯誤，請再試一次'};
        }

        // 發送驗證碼
        const code    = String(Math.floor(100000 + Math.random() * 900000));
        const expires = Date.now() + 5 * 60 * 1000;
        await _fbSet('/auth_codes/' + uname, {code, expires});

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
        const stored = await _fbGet('/auth_codes/' + uname);

        if (!stored)                   return {ok: false, err: '驗證碼不存在，請重新登入'};
        if (stored.expires < Date.now()) return {ok: false, err: '驗證碼已過期，請重新登入'};
        if (stored.code !== code.trim()) return {ok: false, err: '驗證碼錯誤，請再試一次'};

        _fbDel('/auth_codes/' + uname);

        const user = await _fbGet('/users/' + uname);
        _cur = {...user, username: uname};

        // 寫入 sessionStorage 快取
        sessionStorage.setItem('hua_session', JSON.stringify({
            username: uname,
            nickname: _cur.nickname || uname,
            role:     _cur.role,
            avatar:   _cur.avatar || null
        }));

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

        await _fbSet('/users/' + _cur.username, updated);
        _cur.password_hash = newHash;
        return {ok: true};
    }

    // ── 更新頭像 ─────────────────────────────────────────────
    async function updateAvatar(dataUrl) {
        if (!_cur) return {ok: false, err: '尚未登入'};

        const updated = {..._cur};
        delete updated.username;
        updated.avatar = dataUrl;

        await _fbSet('/users/' + _cur.username, updated);
        _cur.avatar = dataUrl;

        const s = JSON.parse(sessionStorage.getItem('hua_session') || '{}');
        s.avatar = dataUrl;
        sessionStorage.setItem('hua_session', JSON.stringify(s));

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

        const exist = await _fbGet('/users/' + uname);
        if (exist) return {ok: false, err: '此帳號已被使用，請換一個'};

        const hash = await _hash(password);
        const nickname = _randomNickname();

        await _fbSet('/users/' + uname, {
            password_hash: hash,
            email,
            role: 'player',
            nickname,
            avatar: null,
            createdAt: Date.now()
        });

        // 發送驗證碼
        const code    = String(Math.floor(100000 + Math.random() * 900000));
        const expires = Date.now() + 5 * 60 * 1000;
        await _fbSet('/auth_codes/' + uname, {code, expires});

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

        await _fbSet('/users/' + _cur.username, updated);
        _cur.nickname = name;

        const s = JSON.parse(sessionStorage.getItem('hua_session') || '{}');
        s.nickname = name;
        sessionStorage.setItem('hua_session', JSON.stringify(s));

        return {ok: true};
    }

    // ── 更新留言 ──────────────────────────────────────────────
    async function updateMessage(text) {
        if (!_cur) return {ok: false, err: '尚未登入'};
        const updated = {..._cur};
        delete updated.username;
        updated.message = text.trim();
        await _fbSet('/users/' + _cur.username, updated);
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

        await _fbSet('/users/' + _cur.username, updated);
        _cur.email = newEmail;

        const s = JSON.parse(sessionStorage.getItem('hua_session') || '{}');
        s.email = newEmail;
        sessionStorage.setItem('hua_session', JSON.stringify(s));

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
        try {
            const s = JSON.parse(sessionStorage.getItem('hua_session') || 'null');
            return (s && s.username) ? s : null;
        } catch { return null; }
    }

    async function restoreSession() {
        const s = getSession();
        if (!s) return null;
        const user = await _fbGet('/users/' + s.username);
        if (!user) { sessionStorage.removeItem('hua_session'); return null; }
        _cur = {...user, username: s.username};
        return _cur;
    }

    function logout() {
        _cur = null;
        sessionStorage.removeItem('hua_session');
    }

    function current() { return _cur; }

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
        current
    };
})();
