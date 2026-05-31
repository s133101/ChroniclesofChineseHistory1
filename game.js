// ============================================================
//  華夏風雲錄 — game.js
//
//  Copyright © 2026 linus622wang@gmail.com
//  All Rights Reserved.
//
//  未經開發者 linus622wang@gmail.com 書面授權，
//  嚴禁任何形式的複製、修改、散佈或商業使用。
//  Unauthorized copying, modification, distribution,
//  or commercial use of this file is strictly prohibited.
// ============================================================

// ---- 全域模式旗標 ----
window.GAME_MODE = 'ai'; // 'ai' | 'host' | 'guest'

// L-6/L-7 Fix：HTML 跳脫函式，防止卡牌名稱/描述 XSS
function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ==============================================================
//  SPECTATE BROADCAST (觀戰狀態廣播)
// ==============================================================
const _SPECTATE_FB   = 'https://chroniclesofchinesehistory1-default-rtdb.asia-southeast1.firebasedatabase.app/spectate';
let   _lastSpectateWrite = 0;

// ---- State ----
let myDeck = [], myHand = [];
let myBoard  = { active:[null,null,null,null,null], bench:[null,null,null,null,null], discard:[] };
let oppDeck = [], oppHandData = [];
let oppBoard = { active:[null,null,null,null,null], bench:[null,null,null,null,null], discard:[] };
let interactionState = { mode:'idle', pendingCardIndex:-1, selectedCard:null };
// 供教學系統偵測當前互動模式
window._getInteractionMode = () => interactionState.mode;
let wineBuff = 0; // 酒：下一張【殺】傷害 +1
let _escListenerAdded = false; // M-9：防止 ESC 監聽器重複掛載

const PHASES = ['抽牌階段','準備階段','主要階段','戰鬥階段','結束階段'];
let currentPhaseIndex = 2;
let isPlayerTurn = true;
let gameActive   = false;
let turnCount    = 1;
let attacksThisTurn = 0; // 本回合已攻擊次數

// ==============================================================
//  SOUND ENGINE (Web Audio API 合成音效)
// ==============================================================
const _SFX = (() => {
    let _ctx = null;
    const ctx = () => {
        if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
        return _ctx;
    };
    const tone = (freq, dur, type = 'sine', vol = 0.12, delay = 0) => {
        try {
            const c = ctx();
            const o = c.createOscillator(), g = c.createGain();
            o.connect(g); g.connect(c.destination);
            o.type = type; o.frequency.setValueAtTime(freq, c.currentTime + delay);
            g.gain.setValueAtTime(vol, c.currentTime + delay);
            g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + dur);
            o.start(c.currentTime + delay); o.stop(c.currentTime + delay + dur);
        } catch(e) {}
    };
    return {
        draw:    () => { tone(680, 0.07, 'sine', 0.10); tone(900, 0.05, 'sine', 0.07, 0.06); },
        place:   () => { tone(420, 0.10, 'triangle', 0.14); tone(560, 0.08, 'sine', 0.10, 0.08); },
        attack:  () => { tone(180, 0.15, 'sawtooth', 0.18); tone(120, 0.20, 'square', 0.12, 0.10); },
        death:   () => { tone(220, 0.25, 'sawtooth', 0.18); tone(150, 0.35, 'square', 0.14, 0.15); tone(100, 0.40, 'sawtooth', 0.10, 0.30); },
        heal:    () => { tone(880, 0.08, 'sine', 0.10); tone(1100, 0.08, 'sine', 0.10, 0.09); tone(1320, 0.10, 'sine', 0.08, 0.18); },
        skill:   () => { tone(660, 0.12, 'sine', 0.13); tone(880, 0.10, 'triangle', 0.10, 0.10); },
        dodge:   () => { tone(900, 0.06, 'sine', 0.12); tone(1100, 0.06, 'sine', 0.12, 0.07); },
        win:     () => [0,0.15,0.30,0.45,0.60].forEach((d,i) => tone(440 + i * 110, 0.25, 'sine', 0.15, d)),
        lose:    () => [0,0.20,0.40].forEach((d,i) => tone(280 - i * 60, 0.40, 'sawtooth', 0.14, d)),
        click:   () => tone(800, 0.04, 'sine', 0.08),
        poison:  () => { tone(300, 0.10, 'sawtooth', 0.08); tone(250, 0.15, 'square', 0.08, 0.08); },
        draw_turn: () => { tone(520, 0.08, 'triangle', 0.10); },
    };
})();

// ---- Card art ----
const CARD_ART = {
    '君王': '👑',
    '大將軍': '⚔️',
    '將軍': '⚔️',
    '軍師': '📜',
    '後勤': '🌾',
    '內政': '🏛️',
    '監察': '👁️',
    '計策': 'gen_strategy_art_1775725939237.png',
    '突發事件': 'gen_event_art_1775725970977.png'
};

// ---- 角色屬性對照表 (ATK: 攻擊, DEF: 防禦) ----
const CHAR_STATS = {
    // 君王 (HP×100=500)
    'm01':{ atk:75,  def:45 }, 'm02':{ atk:85,  def:40 }, 'm03':{ atk:80,  def:50 },
    'm04':{ atk:70,  def:38 }, 'm05':{ atk:78,  def:42 }, 'm06':{ atk:82,  def:40 },
    'm07':{ atk:88,  def:35 }, 'm08':{ atk:72,  def:44 }, 'm09':{ atk:76,  def:42 },
    'm10':{ atk:73,  def:46 }, 'm11':{ atk:90,  def:48 }, 'm12':{ atk:68,  def:45 },
    'm13':{ atk:80,  def:42 }, 'm14':{ atk:95,  def:35 }, 'm15':{ atk:85,  def:40 },
    'm16':{ atk:88,  def:38 }, 'm17':{ atk:82,  def:45 }, 'm18':{ atk:78,  def:42 },
    // 大將軍 (HP×100=400)
    'c01':{ atk:140, def:25 }, 'c02':{ atk:120, def:35 }, 'c03':{ atk:130, def:22 },
    'c04':{ atk:125, def:28 }, 'c05':{ atk:145, def:20 }, 'c06':{ atk:118, def:30 },
    'c07':{ atk:115, def:28 }, 'c08':{ atk:128, def:32 }, 'c09':{ atk:132, def:26 },
    'c10':{ atk:122, def:30 }, 'c11':{ atk:138, def:28 }, 'c12':{ atk:120, def:35 },
    'c13':{ atk:125, def:30 }, 'c14':{ atk:140, def:22 }, 'c15':{ atk:135, def:24 },
    'c16':{ atk:128, def:32 }, 'c17':{ atk:133, def:26 },
    // 將軍 (HP×100=400)
    'g01':{ atk:105, def:28 }, 'g02':{ atk:125, def:18 }, 'g03':{ atk:118, def:20 },
    'g04':{ atk:115, def:22 }, 'g05':{ atk:108, def:26 }, 'g06':{ atk:112, def:22 },
    'g07':{ atk:110, def:20 }, 'g08':{ atk:105, def:25 }, 'g09':{ atk:100, def:24 },
    'g10':{ atk:102, def:22 }, 'g11':{ atk:108, def:25 }, 'g12':{ atk:98,  def:30 },
    'g13':{ atk:110, def:22 }, 'g14':{ atk:115, def:20 }, 'g15':{ atk:95,  def:24 },
    // 軍師 (HP×100=300)
    't01':{ atk:55,  def:15 }, 't02':{ atk:45,  def:12 }, 't03':{ atk:50,  def:14 },
    't04':{ atk:48,  def:12 }, 't05':{ atk:58,  def:10 }, 't06':{ atk:52,  def:12 },
    't07':{ atk:50,  def:14 }, 't08':{ atk:55,  def:10 }, 't09':{ atk:50,  def:16 },
    't10':{ atk:45,  def:14 }, 't11':{ atk:42,  def:14 }, 't12':{ atk:52,  def:12 },
    't13':{ atk:55,  def:10 }, 't14':{ atk:45,  def:14 },
    // 後勤 (HP×100=300)
    's01':{ atk:40,  def:18 }, 's02':{ atk:38,  def:16 }, 's03':{ atk:48,  def:15 },
    's04':{ atk:38,  def:18 }, 's05':{ atk:40,  def:16 }, 's06':{ atk:35,  def:16 },
    's07':{ atk:38,  def:16 }, 's08':{ atk:42,  def:15 }, 's09':{ atk:45,  def:14 },
    // 內政 (HP×100=300)
    'n01':{ atk:45,  def:18 }, 'n02':{ atk:42,  def:16 }, 'n03':{ atk:35,  def:18 },
    'n04':{ atk:40,  def:16 }, 'n05':{ atk:38,  def:16 }, 'n06':{ atk:32,  def:18 },
    'n07':{ atk:35,  def:16 }, 'n08':{ atk:40,  def:15 }, 'n09':{ atk:38,  def:17 },
    'n10':{ atk:32,  def:18 }, 'n11':{ atk:45,  def:15 }, 'n12':{ atk:42,  def:15 },
    // 監察 (HP×100=300)
    'j01':{ atk:35,  def:12 }, 'j02':{ atk:32,  def:12 }, 'j03':{ atk:28,  def:10 },
    'j04':{ atk:30,  def:10 }, 'j05':{ atk:25,  def:10 },
};

const TYPE_STAT_DEFAULTS = {
    '君王':   { atk:80,  def:42 },
    '大將軍': { atk:125, def:28 },
    '將軍':   { atk:108, def:23 },
    '軍師':   { atk:50,  def:12 },
    '後勤':   { atk:40,  def:16 },
    '內政':   { atk:38,  def:16 },
    '監察':   { atk:30,  def:10 },
};

/** 初始化角色卡：擴大 HP×100 並賦予 ATK/DEF */
function initCharCard(card) {
    if (card._statsInited || card.isBasic || card.type === '計策' || card.type === '突發事件') return;
    const s = CHAR_STATS[card.id] || TYPE_STAT_DEFAULTS[card.type] || { atk:50, def:12 };
    card.atk = s.atk;
    card.def = s.def;
    if (typeof card.hp === 'number') {
        card.hp    = card.hp    * 100;
        card.maxHp = card.maxHp * 100;
    }
    card._statsInited = true;
}

// 階段名稱對照
// PHASE_NAMES 已整併至 PHASES，移除重複宣告

// ==============================================================
//  LOADING SCREEN (called by lobby.js)
// ==============================================================
// ── 開發者水印（持續顯示於 console，無法關閉）──
(function _devWatermark() {
    const _c = [
        '%c ╔══════════════════════════════════════╗ ',
        '%c ║   華夏風雲錄  ©  2026                ║ ',
        '%c ║   Developer : linus622wang@gmail.com  ║ ',
        '%c ║   All Rights Reserved.                ║ ',
        '%c ║   未經授權禁止複製、修改或散佈        ║ ',
        '%c ╚══════════════════════════════════════╝ ',
    ];
    const _s = 'color:#d4af37; background:#0d0d0d; font-family:monospace; font-size:12px;';
    _c.forEach(line => console.log(line, _s));

    // 每 60 秒重新印一次，確保持續存在
    setInterval(() => _c.forEach(line => console.log(line, _s)), 60000);
})();

function runLoadingScreen() {
    return new Promise(resolve => {
        const bar = document.getElementById('loading-bar');
        let pct = 0;
        const iv = setInterval(() => {
            pct += Math.random() * 12;
            if (pct >= 100) { pct = 100; clearInterval(iv); }
            if (bar) bar.style.width = pct + '%';
        }, 80);
        setTimeout(() => {
            const ls = document.getElementById('loading-screen');
            if (ls) { ls.style.opacity = '0'; ls.style.transition = 'opacity 0.8s'; }
            setTimeout(() => {
                if (ls) ls.style.display = 'none';
                document.getElementById('game-container').classList.remove('hidden');
                resolve();
            }, 800);
        }, 2000);
    });
}

// ==============================================================
//  INIT GAME
// ==============================================================
function initGame() {
    // 重置狀態
    myBoard  = { active:[null,null,null,null,null], bench:[null,null,null,null,null], discard:[] };
    oppBoard = { active:[null,null,null,null,null], bench:[null,null,null,null,null], discard:[] };
    myHand   = [];
    oppHandData = [];
    interactionState = { mode:'idle', pendingCardIndex:-1, selectedCard:null };
    turnCount = 1;
    isPlayerTurn = true;
    // M-12：確保跨局 AI 狀態歸零，避免上一局殘留值影響新局
    window._aiWineBuff     = 0;
    window._aiLastAttacker = null;
    window._aiLastAtkCard  = null;

    if (window.GAME_MODE === 'guest') {
        // 客方：等候主機送出初始狀態，不在本地建立牌組
        gameActive = true;
        renderAll();
        return;
    }

    // ------ 我方牌組 ------
    myDeck = generateDeck(true); // 拔除君主的 39 張牌
    const extract = (type) => {
        const i = myDeck.findIndex(c => c.type === type);
        if (i !== -1) return myDeck.splice(i, 1)[0];
        return { ...cardDatabase.find(c => c.type === type), uid:'init_' + type };
    };

    // 取得在點將臺選擇的君主，若無則隨機給一個
    let targetMonarch = cardDatabase.find(c => c.id === window.selectedMonarchId);
    if (!targetMonarch) targetMonarch = cardDatabase.find(c => c.type === '君王');
    const myMonarch = { ...targetMonarch, uid: 'init_M_' + Math.random().toString(36).slice(2,11) };

    // 保底一張大將軍
    const myGeneral = extract('大將軍');

    // ── 教學模式：給予固定手牌（確保教學步驟可正確引導）──
    if (window.TUTORIAL_MODE) {
        const tutKill = cardDatabase.find(c => c.name === '殺' && c.isBasic)
                     || cardDatabase.find(c => c.name.includes('殺'));
        myHand = [
            myMonarch,
            myGeneral,
            tutKill ? { ...tutKill, uid: 'tut_k1_' + Date.now() }    : myDeck.pop(),
            tutKill ? { ...tutKill, uid: 'tut_k2_' + Date.now() + 1 } : myDeck.pop(),
            myDeck.pop(),
        ].filter(Boolean);
        myHand.forEach(c => c && initCharCard(c)); // 教學模式手牌同步初始化
    } else {
        myHand = [myMonarch, myGeneral];
        for (let i = 0; i < 5; i++) {
            myHand.push(myDeck.pop());
        }
        _shuffleArr(myHand);
    }
    // 開局手牌一次性初始化（確保所有武將卡 HP×100 在手牌顯示時已生效）
    myHand.forEach(c => c && initCharCard(c));

    // 十全武功：開局額外攜帶兩張突擊卡
    if (myMonarch.skillName === '十全武功') {
        const atkBase = cardDatabase.find(c => c.name.includes('突擊') && c.isBasic);
        if (atkBase) {
            myHand.push({ ...atkBase, uid: 'qql_1_' + Date.now() });
            myHand.push({ ...atkBase, uid: 'qql_2_' + (Date.now() + 1) }); // L-1 Fix：避免同毫秒重複 UID
            toast('👑 <b>乾隆 · 十全武功</b> — 開局攜帶 2 張突擊！', 'gold', 3000);
        }
    }

    // ------ 對手牌組 ------
    oppDeck = generateDeck(true);
    let oppMonarchData = cardDatabase.filter(c => c.type === '君王');
    const oppMonarch = { ...oppMonarchData[Math.floor(Math.random() * oppMonarchData.length)], uid: 'init_opp_M' };
    const extractOpp = (type) => {
        const i = oppDeck.findIndex(c => c.type === type);
        if (i !== -1) return oppDeck.splice(i, 1)[0];
        return { ...cardDatabase.find(c => c.type === type), uid:'opp_init_' + type };
    };
    const oppGeneral = extractOpp('大將軍');

    if (window.GAME_MODE === 'host') {
        // 主機：為客方發 7 張起始手牌
        oppHandData = [oppMonarch, oppGeneral];
        for (let i = 0; i < 5; i++) oppHandData.push(oppDeck.pop());
        _shuffleArr(oppHandData);
    } else {
        // AI 模式：對手起始 7 張手牌
        oppHandData = [oppMonarch, oppGeneral];
        for (let i = 0; i < 5; i++) oppHandData.push(oppDeck.pop());
        _shuffleArr(oppHandData);

        // AI 預設上場：直接從手中將君王和大將軍上陣
        const aiTake = (type) => {
            const idx = oppHandData.findIndex(c => c.type === type);
            return idx !== -1 ? oppHandData.splice(idx, 1)[0] : null;
        };
        const aiM  = aiTake('君王');
        const aiG1 = aiTake('大將軍');
        if (aiM)  { initCharCard(aiM);  oppBoard.active[2] = aiM; }
        if (aiG1) { initCharCard(aiG1); oppBoard.active[1] = aiG1; }
    }

    gameActive = true;
    renderAll();
}

// Fisher-Yates 無偏洗牌
function _shuffleArr(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ==============================================================
//  EVENT LISTENERS (初始化後由 lobby.js 呼叫)
// ==============================================================
function setupEventListeners() {
    const btn = document.getElementById('end-turn-btn');
    if (btn) {
        btn.addEventListener('click', () => {
            if (!isPlayerTurn || btn.disabled) return;
            _SFX.click();
            endPlayerTurn();
        });
    }

    // ESC 鍵：取消選目標狀態（M-9：只掛載一次，避免 _launchGame 反覆呼叫累積監聽器）
    if (!_escListenerAdded) {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && interactionState.mode !== 'idle') {
                interactionState = { mode:'idle', pendingCardIndex:-1, selectedCard:null };
                clearHighlights(); hideHint();
                _SFX.click();
                toast('⚠ 已取消選擇', 'info', 1500);
            }
        });
        _escListenerAdded = true;
    }

    // 滑鼠點擊墳場/牌組插槽
    const myGraveSlot = document.getElementById('my-grave-slot');
    if (myGraveSlot) myGraveSlot.style.cursor = 'pointer',
        myGraveSlot.addEventListener('click', () => showGraveyard(true));
    const oppGraveSlot = document.getElementById('opp-grave-slot');
    if (oppGraveSlot) oppGraveSlot.style.cursor = 'pointer',
        oppGraveSlot.addEventListener('click', () => showGraveyard(false));
}

// ==============================================================
//  RENDERING
// ==============================================================
function renderAll() {
    renderHand();
    renderBoard();
    renderOppBoard();
    renderOppHandUI();
    updateHUDs();
}

function updateHUDs() {
    const safe = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };
    
    // Update visual slot counts
    safe('my-deck-count',   myDeck.length);
    safe('opp-deck-count',  oppDeck.length);
    safe('my-grave-count',  myBoard.discard.length);
    safe('opp-grave-count', oppBoard.discard.length);

    // Update HUD counts
    safe('my-hand-count',   myHand.length);
    safe('opp-hand-count',  oppHandData.length);

    // 君主血條：在前排 + 後排全場搜尋君王類型卡片
    const _myM  = myBoard.active.find(c => c && c.type === '君王')
               || myBoard.bench.find(c => c && c.type === '君王');
    const _oppM = oppBoard.active.find(c => c && c.type === '君王')
               || oppBoard.bench.find(c => c && c.type === '君王');
    const myMhp  = document.getElementById('my-monarch-hp');
    const oppMhp = document.getElementById('opp-monarch-hp');
    const myMbar  = document.getElementById('my-monarch-hp-fill');
    const oppMbar = document.getElementById('opp-monarch-hp-fill');
    if (myMhp)  myMhp.textContent  = _myM  ? `${_myM.hp}/${_myM.maxHp}`   : '--/--';
    if (oppMhp) oppMhp.textContent = _oppM ? `${_oppM.hp}/${_oppM.maxHp}` : '--/--';
    if (myMbar)  myMbar.style.width  = _myM  ? `${Math.max(0,(_myM.hp/_myM.maxHp)*100)}%`   : '0%';
    if (oppMbar) oppMbar.style.width = _oppM ? `${Math.max(0,(_oppM.hp/_oppM.maxHp)*100)}%` : '0%';

    // ── 系統總數值 HUD ──────────────────────────────────────────
    const _sysSum = (board, types) => {
        const units = [...board.active, ...board.bench].filter(c => c && types.includes(c.type));
        if (units.length === 0) return null;
        return {
            hp:  units.reduce((s, c) => s + Math.max(0, c.hp || 0), 0),
            max: units.reduce((s, c) => s + (c.maxHp || 0), 0)
        };
    };
    const _sysClass = (hp, max) => {
        if (!max) return 'stat-none';
        const pct = hp / max;
        return pct > 0.60 ? 'stat-hi' : pct > 0.30 ? 'stat-mid' : 'stat-crit';
    };
    const _setStat = (id, icon, label, data) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (!data) { el.textContent = `${icon} —`; el.className = 'sys-stat stat-none'; return; }
        el.textContent = `${icon} ${data.hp}/${data.max}`;
        el.className   = `sys-stat ${_sysClass(data.hp, data.max)}`;
        el.title       = `${label}：${data.hp} / ${data.max}`;
    };
    const _mil = ['大將軍', '將軍'];
    _setStat('my-stat-mil',   '⚔', '兵力', _sysSum(myBoard,  _mil));
    _setStat('my-stat-log',   '🌾', '儲備', _sysSum(myBoard,  ['後勤']));
    _setStat('my-stat-dom',   '🏛', '民心', _sysSum(myBoard,  ['內政']));
    _setStat('my-stat-insp',  '👁', '忠誠', _sysSum(myBoard,  ['監察']));
    _setStat('opp-stat-mil',  '⚔', '兵力', _sysSum(oppBoard, _mil));
    _setStat('opp-stat-log',  '🌾', '儲備', _sysSum(oppBoard, ['後勤']));
    _setStat('opp-stat-dom',  '🏛', '民心', _sysSum(oppBoard, ['內政']));
    _setStat('opp-stat-insp', '👁', '忠誠', _sysSum(oppBoard, ['監察']));

    safe('phase-display',   PHASES[currentPhaseIndex]);

    const tb = document.getElementById('turn-indicator');
    if (tb) {
        const modeTag = window.GAME_MODE !== 'ai' ? ' [連線]' : '';
        tb.innerText  = isPlayerTurn
            ? `🟢 第 ${turnCount} 回合 — 我方${modeTag}`
            : `🔴 第 ${turnCount} 回合 — 對手${modeTag}`;
        tb.className  = isPlayerTurn ? 'turn-badge' : 'turn-badge opp-turn';
    }
    const btn = document.getElementById('end-turn-btn');
    if (btn) btn.disabled = !isPlayerTurn;

    // 觀戰廣播（主機每 3 秒寫一次）
    const _now = Date.now();
    if (_now - _lastSpectateWrite > 3000) {
        _lastSpectateWrite = _now;
        _writeSpectateState();
    }
}

function renderHand() {
    const hc = document.getElementById('my-hand');
    if (!hc) return;
    hc.innerHTML = '';
    myHand.forEach((card, idx) => {
        const el = makeCardEl(card);
        el.addEventListener('mouseenter', () => showPreview(card));
        el.addEventListener('mouseleave', hidePreview);
        el.addEventListener('click',      () => handleHandClick(idx));
        hc.appendChild(el);
    });
}

function renderOppHandUI() {
    const hc = document.getElementById('opp-hand');
    if (!hc) return;
    hc.innerHTML = '';
    for (let i = 0; i < oppHandData.length; i++) {
        const el = document.createElement('div');
        el.className = 'card card-back';
        hc.appendChild(el);
    }
}

function renderBoard() {
    _renderZone('#my-active-zone', myBoard.active, false, 'active');
    _renderZone('#my-bench-zone',  myBoard.bench,  false, 'bench');
}

function renderOppBoard() {
    _renderZone('#opp-active-zone', oppBoard.active, true, 'active');
    _renderZone('#opp-bench-zone',  oppBoard.bench,  true, 'bench');
}

function _renderZone(selector, arr, isOpp, zone) {
    const slots = document.querySelectorAll(selector + ' .card-slot');
    arr.forEach((card, idx) => {
        const slot = slots[idx];
        if (!slot) return;
        slot.innerHTML = '';
        if (!card) return;
        const el = makeCardEl(card);
        el.addEventListener('mouseenter', () => showPreview(card));
        el.addEventListener('mouseleave', hidePreview);
        if (isOpp) el.addEventListener('click', () => handleOppCardClick(card, zone, idx));
        else       el.addEventListener('click', () => handleMyBoardClick(card, zone, idx));
        slot.appendChild(el);
    });
}

function makeCardEl(card) {
    const el  = document.createElement('div');
    el.className = 'card ' + typeClass(card.type);
    if (card.statusEffects && card.statusEffects.includes('poison')) el.classList.add('poisoned');
    el.dataset.uid = card.uid || '';

    const artValue = card.img || CARD_ART[card.type] || '📜';
    const isImagePath = artValue.toLowerCase().includes('.png') || artValue.toLowerCase().includes('.jpg');
    const artHtml = isImagePath 
        ? `<img src="${_esc(artValue)}" alt="${_esc(card.name)}">` // L-6/L-7 Fix
        : artValue;

    const badge = card.skillName
        ? `<div class="skill-badge" title="${_esc(card.skillName)}">${_esc(card.skillName)}</div>` : ''; // M-5 Fix
    
    // 象徵物元件
    const symbolHtml = card.symbolItem 
        ? `<div class="card-symbol-item">💠 ${card.symbolItem}</div>` : '';

    const isChar = card.hp !== '-' && card.hp !== undefined;

    let hpHtml = '';
    if (isChar) {
        const hp  = Number(card.hp)    || 0;
        const max = Number(card.maxHp) || 1;
        const pct = Math.max(0, Math.min(100, (hp / max) * 100));
        const cls = pct > 60 ? '' : pct > 30 ? 'mid' : 'low';
        const meta = getStatMeta(card.type);
        const atkLvl = getStatLevelLabel(card.atk, card.type, 'atk');
        const defLvl = getStatLevelLabel(card.def, card.type, 'def');
        const atkStr = card.atk ? `${meta.atkIcon}${card.atk}${atkLvl ? `<small class="stat-lv">${atkLvl}</small>` : ''}` : '';
        const defStr = card.def ? `${meta.defIcon}${card.def}${defLvl ? `<small class="stat-lv">${defLvl}</small>` : ''}` : '';
        const statsRow = (card.atk || card.def) ? `<div class="card-stats-row"><span title="${meta.atkLabel}">${atkStr}</span> <span title="${meta.defLabel}">${defStr}</span></div>` : '';
        const sysStatusTxt = getSystemStatusText(card.type, pct / 100);
        const sysStatusSpan = sysStatusTxt ? ` <span class="sys-status-label ${pct > 60 ? 'status-hi' : pct > 30 ? 'status-mid' : 'status-crit'}">${sysStatusTxt}</span>` : '';
        hpHtml = `
          <div class="card-hp-bar-wrap">
            <div class="card-hp-bar">
              <div class="card-hp-fill ${cls}" style="width:${pct}%"></div>
            </div>
            <div class="card-hp-text">${meta.hpLabel} ${hp}/${max}${sysStatusSpan}</div>
          </div>${statsRow}`;
    }

    el.innerHTML = `
      <div class="card-dynasty">${_esc(card.dynasty || '')}</div>
      <div class="card-type">${_esc(card.type || '')}</div>
      ${badge}
      <div class="card-art">${artHtml}</div>
      <div class="card-name">${_esc(card.name || '')}</div>
      ${symbolHtml}
      ${hpHtml}
    `; /* M-6 Fix: XSS 轉義 */
    return el;
}

function typeClass(type) {
    const m = {
        '君王':'theme-monarch','大將軍':'theme-commander','將軍':'theme-general',
        '軍師':'theme-tactician','後勤':'theme-logistics','內政':'theme-domestic',
        '監察':'theme-inspector','計策':'theme-spell','突發事件':'theme-trap'
    };
    return m[type] || 'theme-default';
}

/** 根據兵種回傳對應屬性名稱與圖標 */
function getStatMeta(type) {
    if (type === '後勤') return { atkLabel:'運輸', defLabel:'損耗', hpLabel:'儲備', atkIcon:'🚚', defIcon:'📦' };
    if (type === '內政') return { atkLabel:'開發', defLabel:'治安', hpLabel:'民心', atkIcon:'🌾', defIcon:'🏛' };
    if (type === '監察') return { atkLabel:'諜報', defLabel:'反間', hpLabel:'忠誠', atkIcon:'🕵', defIcon:'🔒' };
    return { atkLabel:'攻擊', defLabel:'防禦', hpLabel:'兵力', atkIcon:'⚔', defIcon:'🛡' };
}

/** 計算某系統的 HP 百分比（0~1），若無部隊回傳 -1 */
function getSystemHpPct(board, type) {
    const units = [...board.active, ...board.bench].filter(c => c && c.type === type);
    if (units.length === 0) return -1;
    const totalHp  = units.reduce((s, c) => s + Math.max(0, c.hp  || 0), 0);
    const totalMax = units.reduce((s, c) => s + (c.maxHp || 1), 0);
    return totalHp / totalMax;
}

/** 某系統是否陷入危機（有部隊且 HP < 30%）*/
function isSystemCritical(board, type) {
    const pct = getSystemHpPct(board, type);
    return pct >= 0 && pct < 0.30;
}

/** 系統整體狀態標籤文字（用於輸贏提示與卡牌顯示）*/
function getSystemStatusText(type, pct) {
    if (pct < 0) return '';
    if (type === '後勤') return pct > 0.60 ? '糧倉充盈' : pct > 0.30 ? '物資平衡' : '捉襟見肘';
    if (type === '內政') return pct > 0.60 ? '安居樂業' : pct > 0.30 ? '民怨不生' : '民怨四起';
    if (type === '監察') return pct > 0.60 ? '上下一心' : pct > 0.30 ? '職守本分' : '人人自危';
    return '';
}

/** 單位屬性等級標籤（運輸/損耗/開發/治安/諜報/反間 顯示 高/中/低 或特殊文字）*/
function getStatLevelLabel(val, type, statType) {
    if (!val) return '';
    if (type === '後勤') {
        if (statType === 'atk') return val >= 45 ? '高' : val >= 38 ? '中' : '低';         // 運輸
        if (statType === 'def') return val >= 18 ? '低損耗' : val >= 14 ? '中損耗' : '高損耗'; // 損耗(反向)
    }
    if (type === '內政') {
        if (statType === 'atk') return val >= 42 ? '+50%' : val >= 36 ? '+20%' : '±0%';    // 開發
        if (statType === 'def') return val >= 18 ? '高' : val >= 14 ? '中' : '低';          // 治安
    }
    if (type === '監察') {
        if (statType === 'atk') return val >= 32 ? '高' : val >= 28 ? '中' : '低';          // 諜報
        if (statType === 'def') return val >= 12 ? '高' : val >= 10 ? '中' : '低';          // 反間
    }
    return '';
}

// ==============================================================
//  CARD PREVIEW
// ==============================================================
function showPreview(card) {
    const el = document.getElementById('card-preview');
    if (!el) return;
    el.classList.remove('hidden');
    const hp  = Number(card.hp)    || 0;
    const max = Number(card.maxHp) || 1;
    const pct = (card.hp !== '-' && card.hp !== undefined) ? Math.max(0, (hp/max)*100) : 0;
    const artValue = card.img || CARD_ART[card.type] || '📜';
    const isImagePath = artValue.toLowerCase().includes('.png') || artValue.toLowerCase().includes('.jpg');
    const artHtml = isImagePath 
        ? `<img src="${_esc(artValue)}" alt="${_esc(card.name)}">` // L-6/L-7 Fix
        : artValue;
    el.innerHTML = `
      <div class="preview-card ${typeClass(card.type)}">
        <div class="preview-header">
          <div class="preview-name">${_esc(card.name)}</div>
          <div class="preview-meta">[${_esc(card.dynasty)}] · ${_esc(card.type)}</div>
        </div>
        <div class="preview-art">${artHtml}</div>
        <div class="preview-body">
          <div class="preview-desc">${_esc(card.desc || '')}</div>
          ${card.skillName ? `<div class="preview-skill">
            <div class="preview-skill-name">【${_esc(card.skillName)}】</div>
            <div class="preview-skill-desc">${_esc(card.skillDesc || '')}</div>
          </div>` : ''} <!-- M-7 Fix: XSS escape -->
          ${(card.hp !== '-' && card.hp !== undefined) ? (() => {
            const pm = getStatMeta(card.type);
            const atkInfo = card.atk ? `<div class="preview-stat-row"><span>${pm.atkIcon} ${pm.atkLabel}：${card.atk}</span><span>${pm.defIcon} ${pm.defLabel}：${card.def || 0}</span></div>` : '';
            return `<div class="preview-hp-section">
            <div class="preview-hp-label">❤ ${pm.hpLabel}</div>
            <div class="preview-hp-bar">
              <div class="preview-hp-fill" style="width:${pct}%"></div>
            </div>
            <div class="preview-hp-val">${hp}/${max}</div>
            ${atkInfo}
          </div>`;
          })() : ''}
        </div>
      </div>`;
}
function hidePreview() {
    const el = document.getElementById('card-preview');
    if (el) el.classList.add('hidden');
}

// ==============================================================
//  TOAST & LOG
// ==============================================================
function toast(msg, type = 'info', duration = 3000) {
    addLogEntry(msg, type);
    const container = document.getElementById('toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = msg;
    container.appendChild(t);
    setTimeout(() => {
        t.style.animation = 'toastOut 0.3s forwards';
        setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
    }, duration);
}

function addLogEntry(msg, type = 'info') {
    const logEl = document.getElementById('battle-log-content');
    if (!logEl) return;
    const entry = document.createElement('div');
    const plain = msg.replace(/<[^>]+>/g, '');
    const typMap = {
        attack:'log-attack', danger:'log-attack', skill:'log-skill',
        draw:'log-draw', heal:'log-heal', gold:'log-system', success:'log-heal', warn:'log-attack'
    };
    entry.className = 'log-entry ' + (typMap[type] || '');
    entry.innerText = plain;
    logEl.prepend(entry);
    while (logEl.children.length > 60) logEl.removeChild(logEl.lastChild);
}

function toggleBattleLog() {
    const p = document.getElementById('battle-log-panel');
    if (p) p.classList.toggle('hidden');
}

// ==============================================================
//  VISUAL FX
// ==============================================================
function spawnSkillFx(emoji, targetEl) {
    const fx = document.getElementById('skill-fx-layer');
    if (!fx) return;
    const d    = document.createElement('div');
    d.className = 'skill-fx';
    d.innerText = emoji;
    const rect = targetEl ? targetEl.getBoundingClientRect()
        : { left: window.innerWidth/2, top: window.innerHeight/2, width: 0, height: 0 };
    d.style.left = (rect.left + rect.width/2  - 30) + 'px';
    d.style.top  = (rect.top  + rect.height/2 - 30) + 'px';
    fx.appendChild(d);
    setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 1100);
}

function spawnDmgPopup(amt, targetEl, isHeal = false) {
    const d = document.createElement('div');
    d.className = isHeal ? 'heal-popup' : 'dmg-popup';
    d.innerText  = isHeal ? `+${amt} ❤` : `-${amt}`;
    const rect  = targetEl ? targetEl.getBoundingClientRect()
        : { left: window.innerWidth/2 - 20, top: window.innerHeight/2 };
    d.style.left = (rect.left + Math.random() * 20) + 'px';
    d.style.top  = (rect.top  - 10) + 'px';
    document.body.appendChild(d);
    setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 1300);
}

function getSlotEl(boardId, idx) {
    const slots = document.querySelectorAll(`#${boardId} .card-slot`);
    return slots[idx] || null;
}

// ==============================================================
//  HINT SYSTEM
// ==============================================================
function showHint(msg) {
    const h = document.getElementById('action-hint');
    if (h) { h.innerHTML = msg; h.classList.remove('hidden'); }
}
function hideHint() {
    const h = document.getElementById('action-hint');
    if (h) h.classList.add('hidden');
}

// ==============================================================
//  TURN FLOW
// ==============================================================
function endPlayerTurn() {
    if (!isPlayerTurn) return;
    isPlayerTurn = false;
    currentPhaseIndex = 4;
    hideHint();
    interactionState = { mode:'idle', pendingCardIndex:-1, selectedCard:null };
    clearHighlights();

    // 回合結束清算
    attacksThisTurn = 0;
    wineBuff = 0; // 回合結束，酒效果消失
    [...myBoard.active, ...myBoard.bench].forEach(c => { if (c) { delete c._dmgBonus; c._xiangBuff = false; } });

    // 仁德（劉備）：回合結束，多餘手牌轉換成君主血量
    const liubeiUnit = myBoard.active.find(c => c && c.skillName === '仁德');
    const _endMyM = myBoard.active[2];
    if (liubeiUnit && _endMyM && myHand.length > 4 && _endMyM.hp < _endMyM.maxHp) {
        const excess  = myHand.length - 4;
        const healed  = Math.min(excess, _endMyM.maxHp - _endMyM.hp);
        _endMyM.hp += healed;
        toast(`❤ <b>${liubeiUnit.name} · 仁德</b> — 君主恢復 ${healed} HP！`, 'heal');
        _SFX.heal();
        renderBoard();
    }

    updateHUDs();

    // ── 客方模式：通知主機結束回合 ──
    if (window.GAME_MODE === 'guest') {
        toast('✅ 回合結束，等待對手行動...', 'info', 2000);
        showHint('⏳ 等待對手行動...');
        Network.send('guest_action', { type: 'end_turn' });
        return;
    }

    // AI / 主機模式
    toast('⚔ 您結束了回合，敵軍動了！', 'warn', 2000);
    setTimeout(startOpponentTurn, 1800);
}

function startMyTurn() {
    if (!gameActive) { gameActive = true; }
    isPlayerTurn = true;
    currentPhaseIndex = 0;
    // L-4 Fix：wineBuff 只在 endPlayerTurn 重置，startMyTurn 不重複重置
    updateHUDs();
    // 綠色閃屏
    const gc = document.getElementById('game-container');
    if (gc) { gc.classList.remove('opp-turn-flash'); void gc.offsetWidth; gc.classList.add('my-turn-flash'); setTimeout(() => gc.classList.remove('my-turn-flash'), 800); }
    toast(`🌅 第 ${turnCount} 回合 — 您的回合開始！`, 'gold', 2000);

    setTimeout(() => {
        drawCard();
        execTurnStartSkills(true);
        currentPhaseIndex = 2;
        updateHUDs();
        showHint('🃏 點擊手牌出牌，或點擊敵方發動突擊');

        // ── 主機：同步到客方 (isGuestTurn=false = 現在是主機的回合) ──
        if (window.GAME_MODE === 'host' && typeof syncStateToGuest === 'function') {
            syncStateToGuest(false);
        }
    }, 700);
}

function drawCard(silent = false) {
    if (myDeck.length === 0) {
        toast('⚠ 牌組已空！', 'danger');
        return;
    }
    const card = myDeck.pop();
    initCharCard(card); // 進手牌時就完成 HP×100 初始化，手牌顯示才正確
    myHand.push(card);
    updateHUDs();
    renderHand();
    if (!silent) {
        toast(`📥 抽牌：<b>${card.name}</b>`, 'draw', 2500);
    }
}

// ==============================================================
//  SKILL ENGINE
// ==============================================================
function execTurnStartSkills(isPlayer) {
    const board = isPlayer ? myBoard : oppBoard;
    const hand  = isPlayer ? myHand  : oppHandData;
    const allUnits = [...board.active, ...board.bench]; // 主將區 + 後營區

    allUnits.forEach(c => {
        if (!c) return;

        // ── 中毒 tick ──
        if (c.statusEffects && c.statusEffects.includes('poison')) {
            c.hp = Math.max(0, c.hp - 20);
            if (isPlayer) {
                spawnDmgPopup(20, getSlotEl('my-active-zone', board.active.indexOf(c) !== -1 ? board.active.indexOf(c) : 0));
                toast(`☠ <b>${c.name}</b> 毒發傷血 20！`, 'danger', 2000);
                _SFX.poison();
            }
            if (c.hp <= 0) {
                c.hp = 0;
                const zoneKey = board.active.includes(c) ? 'active' : 'bench';
                const zoneIdx = board[zoneKey].indexOf(c);
                execOnDeath(c, board, isPlayer); // H-2 Fix：觸發死亡技能
                board[zoneKey][zoneIdx] = null;
                board.discard.push(c);
                if (isPlayer) renderBoard(); else renderOppBoard();
                checkWinCondition(); // H-2 Fix：中毒死亡後判斷勝負
            }
        }

        // ── 多多益善 / 糧道（韓信/蕭何）──
        if (c.skillName === '多多益善' || c.skillName === '糧道') {
            if (isPlayer) { toast(`🌟 <b>${c.name} · ${c.skillName}</b> — 額外補給！`, 'skill'); _SFX.draw_turn(); drawCard(true); }
            else { if (oppDeck.length > 0) { oppHandData.push(oppDeck.pop()); renderOppHandUI(); } }
        }

        // ── 雄才大略（漢武帝）── 手牌 < 2 時補給
        if (c.skillName === '雄才大略' && hand.length < 2) {
            if (isPlayer) { toast(`🌟 <b>${c.name} · 雄才大略</b> — 強勢補給 +2！`, 'skill'); drawCard(true); drawCard(true); }
        }

        // ── 穩紮穩打（王翦）──
        if (c.skillName === '穩紮穩打' && c.hp < c.maxHp) {
            const stableHeal = Math.floor(c.maxHp * 0.05);
            c.hp = Math.min(c.maxHp, c.hp + stableHeal);
            if (isPlayer) { toast(`💚 <b>${c.name} · 穩紮穩打</b> — 恢復 ${stableHeal} HP！`, 'heal'); _SFX.heal(); }
        }

        // ── 開皇之治（隋文帝）── 文臣回血
        if (c.skillName === '開皇之治') {
            board.bench.forEach(b => {
                if (!b || b.hp >= b.maxHp) return;
                const kaihHeal = Math.floor(b.maxHp * 0.05);
                b.hp = Math.min(b.maxHp, b.hp + kaihHeal);
                if (isPlayer) toast(`💚 <b>開皇之治</b> — ${b.name} 恢復 ${kaihHeal} HP！`, 'heal');
            });
        }

        // ── 木牛流馬（諸葛亮，後勤）── 回血 + 補牌
        if (c.skillName === '木牛流馬') {
            if (c.hp < c.maxHp) { const muHeal = Math.floor(c.maxHp * 0.05); c.hp = Math.min(c.maxHp, c.hp + muHeal); if (isPlayer) toast(`🌾 <b>${c.name} · 木牛流馬</b> — 恢復 ${muHeal} HP！`, 'heal'); }
            if (isPlayer) { drawCard(true); toast(`🌾 <b>${c.name} · 木牛流馬</b> — 糧草充足，補給 1 張！`, 'skill'); }
            else { if (oppDeck.length > 0) { oppHandData.push(oppDeck.pop()); renderOppHandUI(); } }
        }

        // ── 青苗法（王安石）── 回血，若君王在場恢復比例更多
        if (c.skillName === '青苗法') {
            const monarch = board.active[2];
            const healAmt = Math.floor(c.maxHp * (monarch ? 0.10 : 0.05));
            if (c.hp < c.maxHp) {
                c.hp = Math.min(c.maxHp, c.hp + healAmt);
                if (isPlayer) toast(`🌿 <b>${c.name} · 青苗法</b> — 恢復 ${healAmt} HP！`, 'heal');
            }
        }

        // ── 房謀（房玄齡）── 30% 機率補一張計策卡
        if (c.skillName === '房謀' && isPlayer && Math.random() < 0.3) {
            const spellCards = cardDatabase.filter(f => f.type === '計策' && !f.isBasic);
            if (spellCards.length > 0) {
                const sp = { ...spellCards[Math.floor(Math.random() * spellCards.length)], uid: 'fanglou_' + Date.now() };
                myHand.push(sp);
                toast(`📜 <b>${c.name} · 房謀</b> — 計謀入懷：<b>${sp.name}</b>！`, 'skill');
                _SFX.draw_turn();
                renderHand(); updateHUDs();
            }
        }

        // ── 配享（張廷玉）── 每回合主公血量上限 +1（最多 +3）
        if (c.skillName === '配享' && board.active[2]) {
            const m = board.active[2];
            const bonus = (m._peixiangBonus || 0);
            if (bonus < 3) {
                m.maxHp += 30;
                m._peixiangBonus = bonus + 1;
                if (isPlayer) toast(`✨ <b>${c.name} · 配享</b> — 君主兵力上限 +30！`, 'skill');
            }
        }

        // ── 救時（姚崇）── 隨機為一名武將回復 1 HP
        if (c.skillName === '救時') {
            const wounded = allUnits.filter(u => u && u !== c && u.hp > 0 && u.hp < u.maxHp);
            if (wounded.length > 0) {
                const tgt = wounded[Math.floor(Math.random() * wounded.length)];
                const jiushiHeal = Math.floor(tgt.maxHp * 0.08);
                tgt.hp = Math.min(tgt.maxHp, tgt.hp + jiushiHeal);
                if (isPlayer) toast(`💊 <b>${c.name} · 救時</b> — ${tgt.name} 獲得 ${jiushiHeal} HP！`, 'heal');
            }
        }

        // ── 湘軍（曾國藩）── 每回合可強化一名己方武將攻擊力
        if (c.skillName === '湘軍' && isPlayer) {
            const candidates = board.active.filter(u => u && u !== c && !u._xiangBuff);
            if (candidates.length > 0) {
                const tgt = candidates[0];
                tgt._xiangBuff = true;
                tgt._dmgBonus = (tgt._dmgBonus || 0) + 1;
                toast(`⚔ <b>${c.name} · 湘軍</b> — ${tgt.name} 本回合攻擊力 +1！`, 'skill');
            }
        }

        // ── 相術（管仲）── 每回合開始可選擇棄掉一張手牌換抽兩張
        if (c.skillName === '相術' && isPlayer && hand.length > 0) {
            // 自動丟棄手牌中最末一張（非角色牌），換抽兩張
            const discardable = hand.findIndex(h => h.type === '計策' || h.type === '突發事件' || h.isBasic);
            if (discardable !== -1) {
                const thrown = hand.splice(discardable, 1)[0];
                myBoard.discard.push(thrown);
                toast(`📊 <b>${c.name} · 相術</b> — 棄 <b>${thrown.name}</b>，換抽 2 張！`, 'skill');
                drawCard(true); drawCard(true);
                renderHand(); updateHUDs();
            }
        }

        // ── 黃袍加身（宋太祖）── 手牌中第一張事件/計策卡 → 固守
        if (c.skillName === '黃袍加身' && isPlayer) {
            const fixIdx = hand.findIndex(h => h.type === '突發事件' || (h.type === '計策' && !h.name.includes('固守') && !h.name.includes('突擊')));
            if (fixIdx !== -1) {
                const fixCard = hand[fixIdx];
                const dodgeBase = cardDatabase.find(d => d.name.includes('固守') && d.isBasic);
                if (dodgeBase) {
                    hand[fixIdx] = { ...dodgeBase, uid: 'hpj_' + Date.now() };
                    toast(`👑 <b>${c.name} · 黃袍加身</b> — 將 <b>${fixCard.name}</b> 轉換為固守！`, 'gold', 3000);
                    _SFX.skill();
                    if (isPlayer) { renderHand(); updateHUDs(); }
                }
            }
        }

        // ── 六軍鏡（李靖）── 在場時全體己方武將最大血量 +1（每人限一次）
        if (c.skillName === '六軍鏡' && !c._liujingApplied) {
            c._liujingApplied = true;
            allUnits.forEach(u => {
                if (u && u !== c && !u._liujingBonus) {
                    u.maxHp += 50;
                    u._liujingBonus = true;
                }
            });
            if (isPlayer) toast(`⚔ <b>${c.name} · 六軍鏡</b> — 全軍最大兵力 +50！`, 'skill');
        }

        // ── 黑衣（姚廣孝）── 對手回合結束時，對敵方無防禦武將造成 1 點傷害
        if (c.skillName === '黑衣' && !isPlayer) {
            // 姚廣孝在 AI 的後營，對玩家前排造成 25 點暗算
            const pTarget = myBoard.active.find(u => u && u.hp > 0);
            if (pTarget) {
                const pi = myBoard.active.indexOf(pTarget);
                pTarget.hp = Math.max(0, pTarget.hp - 25);
                spawnDmgPopup(25, getSlotEl('my-active-zone', pi));
                toast(`🖤 <b>${c.name} · 黑衣</b> — 暗中刺傷 ${pTarget.name}！`, 'danger', 2500);
                _SFX.skill();
            }
        }
    });

    // ── 系統被動效果（按系統整體計算）───────────────────

    // 後勤系統
    const logUnits = allUnits.filter(c => c && c.type === '後勤');
    if (logUnits.length > 0) {
        const avgLogAtk = logUnits.reduce((s, c) => s + (c.atk || 0), 0) / logUnits.length;
        const avgLogDef = logUnits.reduce((s, c) => s + (c.def || 0), 0) / logUnits.length;
        // 運輸高 → 補給充足，補抽 1 張牌
        if (avgLogAtk >= 45) {
            if (isPlayer) { toast('🚚 <b>運輸暢通</b> — 糧草充足，額外補給！', 'skill', 2000); _SFX.draw_turn(); drawCard(true); }
            else { if (oppDeck.length > 0) { oppHandData.push(oppDeck.pop()); } }
        }
        // 損耗低（DEF 高）→ 後勤武將微量回血
        if (avgLogDef >= 18) {
            logUnits.forEach(c => {
                if (c.hp > 0 && c.hp < c.maxHp) {
                    const regen = Math.floor(c.maxHp * 0.03);
                    c.hp = Math.min(c.maxHp, c.hp + regen);
                    if (isPlayer) toast(`💚 <b>低損耗</b> — ${c.name} 自動回復 ${regen} 儲備！`, 'heal', 1800);
                }
            });
        }
    }

    // 內政系統
    const domUnits = allUnits.filter(c => c && c.type === '內政');
    if (domUnits.length > 0) {
        const avgDomAtk = domUnits.reduce((s, c) => s + (c.atk || 0), 0) / domUnits.length;
        // 開發高(+50%) → 每回合額外抽 1 張
        if (avgDomAtk >= 42) {
            if (isPlayer) { toast('🌾 <b>開發興旺</b> — 稅收豐盈，額外補給！', 'skill', 2000); _SFX.draw_turn(); drawCard(true); }
            else { if (oppDeck.length > 0) { oppHandData.push(oppDeck.pop()); } }
        }
        // 開發中(+20%) → 30% 機率額外抽 1 張
        else if (avgDomAtk >= 36 && Math.random() < 0.30) {
            if (isPlayer) { toast('🌾 <b>開發穩健</b> — 小有盈餘，補給一張！', 'skill', 2000); drawCard(true); }
            else { if (oppDeck.length > 0) { oppHandData.push(oppDeck.pop()); } }
        }
    }

    // 監察系統
    const inspUnits = allUnits.filter(c => c && c.type === '監察');
    if (inspUnits.length > 0) {
        const avgInspAtk  = inspUnits.reduce((s, c) => s + (c.atk || 0), 0) / inspUnits.length;
        const avgInspDef  = inspUnits.reduce((s, c) => s + (c.def || 0), 0) / inspUnits.length;
        // 諜報高 → 每 3 回合顯示對手手牌情報（toast）
        if (avgInspAtk >= 32 && isPlayer && (turnCount % 3 === 0) && oppHandData.length > 0) {
            const revealed = oppHandData.map(c => c.name).join('、');
            toast(`🕵 <b>諜報高超</b> — 情報來報：對手持有 [${revealed}]`, 'gold', 5000);
        }
        // 反間高 → 20% 機率令對手棄置 1 張手牌
        if (avgInspDef >= 12 && isPlayer && Math.random() < 0.20 && oppHandData.length > 0) {
            const di = Math.floor(Math.random() * oppHandData.length);
            const purged = oppHandData.splice(di, 1)[0];
            oppBoard.discard.push(purged);
            toast(`🔒 <b>反間得力</b> — 截獲情報，對手棄置 <b>${purged.name}</b>！`, 'attack', 2500);
            if (isPlayer) { renderOppHandUI(); updateHUDs(); }
        }
    }

    // 回合開始重置臨時狀態
    allUnits.forEach(c => {
        if (!c) return;
        c._xiangBuff = false;
        c._immune    = false; // 丹心免疫重置
        c._daHitUsed = false; // 大隕石術觸發重置
    });

    if (isPlayer) renderBoard();
    else renderOppBoard();
}

function execAttackMods(board) {
    // 霸王：鎖定技，突擊無法被固守閃避
    const unDodgeable = board.active.some(c => c && c.skillName === '霸王');
    // 水戰 (韓世忠)：無視對手的第一張固守
    const ignoreFirstDodge = board.active.some(c => c && c.skillName === '水戰');
    // 蒙古鐵騎 (成吉思汗)：大將軍突擊必定額外連擊 +1 傷害
    let extraDmg = board.active.some(c => c && c.skillName === '蒙古鐵騎') ? 1 : 0;
    // 精忠報國 (岳飛)：己方主公血量 < 20% 時，攻擊力加成
    const myM = board.active[2];
    if (myM && myM.hp < Math.floor(myM.maxHp * 0.20) && board.active.some(c => c && c.skillName === '精忠報國')) extraDmg += Math.floor(board.active.filter(c => c && c.atk).reduce((s,c) => s + c.atk, 0) * 0.3);
    // 天命 (周武王)：己方所有將軍打出的突擊傷害 +1
    if (board.active.some(c => c && c.skillName === '天命')) extraDmg++;
    // 湘軍臨時攻擊力加成
    board.active.forEach(c => { if (c && c._dmgBonus) extraDmg += c._dmgBonus; });
    // 可否攻擊後排（長驅直入）
    const canAttackBench = board.active.some(c => c && c.skillName === '長驅直入');
    // AoE（火燒赤壁：相鄰 AoE）
    const hasAoE = board.active.some(c => c && c.skillName === '火燒赤壁');
    // 火燒連營（陸遜）：君主受傷時追加 1 傷害給隨機敵軍（與 hasAoE 不同）
    const hasFireLianYing = board.active.some(c => c && c.skillName === '火燒連營');
    // 封狼居胥：50% 秒殺 HP ≤ 2 的敵將
    const hasFengLang = board.active.some(c => c && c.skillName === '封狼居胥');
    return { unDodgeable, ignoreFirstDodge, extraDmg, canAttackBench, hasAoE, hasFireLianYing, hasFengLang };
}

/** 執行 AoE（火燒赤壁：相鄰敵將各受 1 點傷害）*/
function execAoEDamage(targetIdx, targetZone, isPlayerAttacking) {
    const board = isPlayerAttacking ? oppBoard : myBoard;
    const zoneName = isPlayerAttacking ? 'opp' : 'my';
    const zoneId = `${zoneName}-${targetZone}-zone`;
    const arr = board[targetZone];
    [-1, 1].forEach(offset => {
        const i = targetIdx + offset;
        if (i < 0 || i >= arr.length || !arr[i]) return;
        arr[i].hp = Math.max(0, arr[i].hp - 25);
        spawnDmgPopup(25, getSlotEl(zoneId, i));
        toast(`🔥 <b>火攻連延</b> — ${arr[i].name} 受到 25 點延燒傷害！`, 'danger', 2000);
        if (arr[i].hp <= 0) {
            arr[i].hp = 0;
            toast(`💀 <b>${arr[i].name}</b> 在大火中陣亡！`, 'danger', 3000);
            _SFX.death();
            execOnDeath(arr[i], board, !isPlayerAttacking); // C-1 Fix
            const attacker = isPlayerAttacking ? myBoard.active.find(c=>c) : oppBoard.active.find(c=>c);
            execOnKill(attacker, arr[i], isPlayerAttacking); // C-1 Fix
            board.discard.push(arr[i]);
            arr[i] = null;
        }
    });
    if (isPlayerAttacking) renderOppBoard(); else renderBoard();
    checkWinCondition(); // H-3 Fix：AoE 死亡後判斷勝負
}

function execDefenseMods(defender, dmg) {
    if (!defender) return dmg;

    // 丹心觸發的免疫狀態
    if (defender._immune) {
        toast(`🛡 <b>${defender.name}</b> 本回合免疫傷害！`, 'skill');
        return 0;
    }

    if (defender.skillName === '天可汗') {
        dmg = Math.max(0, Math.floor(dmg * 0.80));
        toast(`🛡 <b>${defender.name} · 天可汗</b> — 傷害減免 20%！`, 'skill');
    }
    if (defender.skillName === '堅城') {
        dmg = Math.ceil(dmg / 2);
        toast(`🏰 <b>${defender.name} · 堅城</b> — 傷害砍半！`, 'skill');
    }

    // 保衛（于謙）：君主受到致命傷害時，于謙代為承受（全場限一次）
    if (defender.type === '君王' && defender.hp <= dmg) {
        const isMyMonarch = myBoard.active[2] === defender;
        const allyBoard2  = isMyMonarch ? myBoard : oppBoard;
        const yuQian = [...allyBoard2.active, ...allyBoard2.bench].find(c => c && c.skillName === '保衛' && c.hp > 0 && !c._baoWeiUsed);
        if (yuQian) {
            yuQian._baoWeiUsed = true;
            yuQian.hp = Math.max(0, yuQian.hp - dmg);
            const yqZone = allyBoard2.active.indexOf(yuQian) !== -1 ? 'active' : 'bench';
            const yqIdx  = yqZone === 'active' ? allyBoard2.active.indexOf(yuQian) : allyBoard2.bench.indexOf(yuQian);
            const pfx    = isMyMonarch ? 'my' : 'opp';
            spawnDmgPopup(dmg, getSlotEl(`${pfx}-${yqZone}-zone`, yqIdx));
            toast(`🛡 <b>${yuQian.name} · 保衛</b> — 捨身護主，承受致命傷害！（全場限一次）`, 'gold', 3500);
            _SFX.skill();
            if (isMyMonarch) renderBoard(); else renderOppBoard();
            if (yuQian.hp <= 0) {
                yuQian.hp = 0;
                allyBoard2[yqZone][yqIdx] = null;
                allyBoard2.discard.push(yuQian);
                toast(`💀 <b>${yuQian.name}</b> 為國捐軀！`, 'danger', 3000);
                if (isMyMonarch) renderBoard(); else renderOppBoard();
            }
            return 0; // 君主免受傷害
        }
    }

    // 攝政 + 柱石 只對君主生效
    if (defender.type === '君王') {
        const isMyMonarch = myBoard.active[2] === defender;
        const allyBoard   = isMyMonarch ? myBoard : oppBoard;
        const zonePrefix  = isMyMonarch ? 'my' : 'opp';

        // 攝政（多爾袞）：替主公承受傷害
        const dorgon = [...allyBoard.active, ...allyBoard.bench].find(c => c && c.skillName === '攝政' && c.hp > 0);
        if (dorgon) {
            const dIdx = allyBoard.active.indexOf(dorgon);
            const dZone = dIdx !== -1 ? 'active' : 'bench';
            const dZoneIdx = dIdx !== -1 ? dIdx : allyBoard.bench.indexOf(dorgon);
            dorgon.hp = Math.max(0, dorgon.hp - dmg);
            spawnDmgPopup(dmg, getSlotEl(`${zonePrefix}-${dZone}-zone`, dZoneIdx));
            toast(`🛡 <b>${dorgon.name} · 攝政</b> — 替主公承受 ${dmg} 傷害！`, 'skill');
            _SFX.skill();
            if (isMyMonarch) renderBoard(); else renderOppBoard();
            return 0;
        }

        // 柱石（陸抗）：君主受傷上限為 1
        const lukan = [...allyBoard.active, ...allyBoard.bench].find(c => c && c.skillName === '柱石');
        if (lukan) {
            dmg = Math.min(dmg, 1);
            toast(`🏯 <b>${lukan.name} · 柱石</b> — 護衛主公，傷害上限 1！`, 'skill');
        }
    }
    return dmg;
}

function execOnKill(attacker, deadCard, isPlayerAttacking) {
    // ── 攻擊方 On-Kill 技能 ──
    if (attacker) {
        // 坑殺（白起）：擊殺波及敵方主公 1 HP
        if (attacker.skillName === '坑殺') {
            const tgtMonarch = isPlayerAttacking ? oppBoard.active[2] : myBoard.active[2];
            if (tgtMonarch) {
                tgtMonarch.hp = Math.max(0, tgtMonarch.hp - 30);
                toast(`🩸 <b>${attacker.name} · 坑殺</b> — 斬殺連累主公！`, 'skill');
                spawnDmgPopup(30, getSlotEl(isPlayerAttacking ? 'opp-active-zone' : 'my-active-zone', 2));
            }
        }
        // 鐵腕（朱元璋）：敵將陣亡，主公恢復 2 HP
        const killerMonarch = isPlayerAttacking ? myBoard.active[2] : oppBoard.active[2];
        if (killerMonarch && killerMonarch.skillName === '鐵腕') {
            killerMonarch.hp = Math.min(killerMonarch.maxHp, killerMonarch.hp + Math.floor(killerMonarch.maxHp * 0.08));
            toast(`💪 <b>${killerMonarch.name} · 鐵腕</b> — 敵將陣亡，恢復 8% 兵力！`, 'heal');
            _SFX.heal();
            if (isPlayerAttacking) renderBoard(); else renderOppBoard();
        }
        // 削藩（康熙）：擊殺後強制裁撤敵方後營一人
        if (killerMonarch && killerMonarch.skillName === '削藩') {
            const deadBoard = isPlayerAttacking ? oppBoard : myBoard;
            const benchTarget = deadBoard.bench.find(c => c !== null);
            if (benchTarget) {
                const bi = deadBoard.bench.indexOf(benchTarget);
                deadBoard.bench[bi] = null;
                deadBoard.discard.push(benchTarget);
                toast(`🗡 <b>${killerMonarch.name} · 削藩</b> — 強制裁撤 ${benchTarget.name}！`, 'skill');
                if (isPlayerAttacking) renderOppBoard(); else renderBoard();
            }
        }
        // 蘇定方（生擒）：擊殺後將敵將加入手牌
        if (attacker.skillName === '生擒' && isPlayerAttacking) {
            const copy = { ...deadCard, uid: 'captured_' + Date.now(), _captured: true };
            // H-5 Fix：從敵方棄牌堆移除，避免雙重計入大將軍/將軍死亡條件
            const discardIdx = oppBoard.discard.indexOf(deadCard);
            if (discardIdx !== -1) oppBoard.discard.splice(discardIdx, 1);
            myHand.push(copy);
            renderHand(); updateHUDs();
            toast(`⚔ <b>${attacker.name} · 生擒</b> — 俘虜 <b>${deadCard.name}</b> 入手牌！`, 'skill');
            _SFX.skill();
        }
    }
    // ── 死亡者 On-Death 技能 ──
    execOnDeath(deadCard, isPlayerAttacking ? oppBoard : myBoard, isPlayerAttacking ? false : true);
}

/** 死亡觸發技能（被殺後觸發） */
function execOnDeath(deadCard, ownerBoard, isOwnerPlayer) {
    if (!deadCard) return;

    // 毒士（賈詡）：死亡時 2 名敵將中毒
    if (deadCard.skillName === '毒士') {
        const enemyBoard = isOwnerPlayer ? oppBoard : myBoard;
        const cands = [...enemyBoard.active, ...enemyBoard.bench].filter(c => c && c.hp > 0);
        _shuffleArr(cands);
        cands.slice(0, 2).forEach(t => {
            t.statusEffects = t.statusEffects || [];
            if (!t.statusEffects.includes('poison')) {
                t.statusEffects.push('poison');
                toast(`☠ <b>${deadCard.name} · 毒士</b> — ${t.name} 中毒！`, 'danger', 2500);
            }
        });
        if (!isOwnerPlayer) renderBoard(); else renderOppBoard();
        _SFX.poison();
    }

    // 楊漣（死諫）：臨死帶走一名敵方武將
    if (deadCard.skillName === '死諫') {
        const enemyBoard = isOwnerPlayer ? oppBoard : myBoard;
        const victims = enemyBoard.active.filter(c => c && c.type !== '君王');
        if (victims.length > 0) {
            const v = victims[Math.floor(Math.random() * victims.length)];
            const vi = enemyBoard.active.indexOf(v);
            enemyBoard.active[vi] = null;
            enemyBoard.discard.push(v);
            toast(`💀 <b>${deadCard.name} · 死諫</b> — 臨終拉下 <b>${v.name}</b>！`, 'danger', 3500);
            if (!isOwnerPlayer) renderOppBoard(); else renderBoard();
            _SFX.death();
        }
    }

    // 丹心（文天祥）：全軍本回合免疫傷害
    if (deadCard.skillName === '丹心') {
        [...ownerBoard.active, ...ownerBoard.bench].forEach(c => { if (c) c._immune = true; });
        toast(`❤ <b>${deadCard.name} · 丹心</b> — 全軍本回合免疫傷害！`, 'gold', 3000);
        _SFX.skill();
    }

    // 遺計（郭嘉）on death：補抽 2 張（玩家陣亡）
    if (deadCard.skillName === '遺計' && isOwnerPlayer) {
        setTimeout(() => { drawCard(true); drawCard(true); }, 400);
        toast(`📜 <b>郭嘉 · 遺計</b> — 魂歸遺計，補抽 2 張！`, 'skill');
    }
}

function execDamageResponse(injured, isPlayerInjured) {
    if (!injured) return;
    if (injured.skillName === '奸雄' || injured.skillName === '突陣') {
        const opHand = isPlayerInjured ? oppHandData : myHand;
        const opDiscard = isPlayerInjured ? oppBoard.discard : myBoard.discard;
        if (opHand.length > 0) {
            const di = Math.floor(Math.random() * opHand.length);
            const dropped = opHand.splice(di, 1)[0];
            opDiscard.push(dropped);
            if (!isPlayerInjured) { renderHand(); updateHUDs(); }
            else { renderOppHandUI(); updateHUDs(); }
            toast(`🦅 <b>${injured.name} · ${injured.skillName}</b> — 奪取對手 1 張手牌！`, 'skill');
        }
    }
    if (injured.skillName === '遺計' && isPlayerInjured) {
        drawCard(true); drawCard(true);
        toast(`📜 <b>郭嘉 · 遺計</b> — 受傷連抽 2 張！`, 'skill');
    }
}

// ==============================================================
//  PLAY CARD FROM HAND
// ==============================================================
function handleHandClick(handIndex) {
    if (!isPlayerTurn || currentPhaseIndex !== 2) {
        toast('⚠ 只能在主要階段出牌！', 'warn');
        return;
    }
    const card = myHand[handIndex];

    // ── 客方：重定向到客方處理器 ──
    if (window.GAME_MODE === 'guest') {
        _guestHandCardAction(handIndex, card);
        return;
    }

    // ─── ACTION CARDS ───────────────────────────────
    if (card.type === '計策' || card.type === '突發事件' || card.isBasic) {
        // 所有「殺」類攻擊牌：先選攻擊武將，再選目標
        const isAnyKill = card.name.includes('突擊') || card.name.includes('火殺') ||
                          card.name.includes('雷殺') || card.name.includes('水殺');
        if (isAnyKill) {
            const validAttackers = myBoard.active.filter(c => c !== null && c.atk);
            if (validAttackers.length === 0) {
                toast('⚠ 需要先派遣武將到主將區才能攻擊！', 'warn');
                return;
            }
            interactionState = { mode:'select_attacker', pendingCardIndex:handIndex, selectedCard:card, attacker:null };
            const emoji = card.name.includes('火殺') ? '🔥' : card.name.includes('雷殺') ? '⚡' : card.name.includes('水殺') ? '💧' : '⚔';
            showHint(`${emoji} 選擇出擊武將（點擊己方主將區武將）`);
            highlightAttackers();
            return;
        }
        if (card.name.includes('休整')) {
            interactionState = { mode:'select_target_ally', pendingCardIndex:handIndex, selectedCard:card };
            showHint('💚 選擇回復目標（點擊我方武將）');
            highlightAllies();
            return;
        }
        if (card.name.includes('釜底抽薪')) {
            interactionState = { mode:'select_target_enemy', pendingCardIndex:handIndex, selectedCard:card };
            showHint('🔥 選擇後營目標（點擊對手後勤）');
            highlightEnemies();
            return;
        }
        if (card.name.includes('草船借箭')) {
            _consumeHandCard(handIndex, card);
            toast('🏹 <b>草船借箭</b> — 借得箭矢，抽取兩張牌！', 'skill');
            setTimeout(() => drawCard(true), 100);
            setTimeout(() => drawCard(true), 400);
            _maybeSyncHost();
            return;
        }
        // 酒：給下一張殺 +1 傷，或在瀕死時當桃（瀕死邏輯在 _resolveDefenseTake）
        if (card.name === '酒' || (card.name && card.name.startsWith('酒'))) {
            _consumeHandCard(handIndex, card);
            wineBuff++;
            toast('🍷 <b>酒</b> — 豪飲壯膽！本回合下一張【殺】傷害 +1！', 'skill');
            _SFX.skill();
            return;
        }
        // 無中生有：立即摸兩張牌
        if (card.name.includes('無中生有')) {
            _consumeHandCard(handIndex, card);
            toast('✨ <b>無中生有</b> — 憑空借得兩張牌！', 'skill');
            _SFX.draw();
            setTimeout(() => drawCard(true), 100);
            setTimeout(() => drawCard(true), 400);
            _maybeSyncHost();
            return;
        }
        // 過河拆橋：隨機棄置對手一名場上武將
        if (card.name.includes('過河拆橋')) {
            _consumeHandCard(handIndex, card);
            const allOppUnits = [
                ...oppBoard.active.map((c, i) => c ? { c, zone:'active', i } : null),
                ...oppBoard.bench.map((c, i) => c ? { c, zone:'bench', i } : null)
            ].filter(Boolean);
            // 萬里長城（秦始皇）：後營免疫魔法破壞
            const wallKing = oppBoard.active[2];
            if (wallKing && wallKing.skillName === '萬里長城') {
                toast(`🏯 <b>${wallKing.name} · 萬里長城</b> — 護衛全場，過河拆橋失效！`, 'skill');
                _maybeSyncHost(); return;
            }
            if (allOppUnits.length > 0) {
                const tgt = allOppUnits[Math.floor(Math.random() * allOppUnits.length)];
                toast(`🌉 <b>過河拆橋</b> — 強制棄置 <b>${tgt.c.name}</b>！`, 'attack');
                _SFX.attack();
                execOnDeath(tgt.c, oppBoard, false);
                oppBoard[tgt.zone][tgt.i] = null;
                oppBoard.discard.push(tgt.c);
                renderOppBoard(); updateHUDs();
                if (checkWinCondition()) { _maybeSyncHost(); return; } // C-5 Fix：棄置場上武將後立即判斷勝負
            } else if (oppHandData.length > 0) {
                const discarded = oppHandData.splice(Math.floor(Math.random() * oppHandData.length), 1)[0];
                toast(`🌉 <b>過河拆橋</b> — 棄置對手手中 <b>${discarded.name}</b>！`, 'attack');
                oppBoard.discard.push(discarded);
                renderOppHandUI();
            } else {
                toast('🌉 <b>過河拆橋</b> — 對手場上已無目標！', 'warn');
            }
            checkWinCondition();
            _maybeSyncHost(); return;
        }
        // 順手牽羊：從對手手中竊取最多兩張有用牌
        if (card.name.includes('順手牽羊')) {
            _consumeHandCard(handIndex, card);
            const usefulKeywords = ['突擊','火殺','雷殺','水殺','固守','休整','酒'];
            const usefulCards = oppHandData.filter(c => c.name && usefulKeywords.some(k => c.name.includes(k)));
            if (usefulCards.length === 0) {
                toast('🐑 <b>順手牽羊</b> — 對手手中無可用牌可竊！', 'warn');
            } else {
                const stolen = [];
                for (let i = 0; i < 2 && usefulCards.length > 0; i++) {
                    const ri = Math.floor(Math.random() * usefulCards.length);
                    const sc = usefulCards.splice(ri, 1)[0];
                    const oi = oppHandData.indexOf(sc);
                    if (oi !== -1) { oppHandData.splice(oi, 1); initCharCard(sc); myHand.push(sc); stolen.push(sc.name); }
                }
                toast(`🐑 <b>順手牽羊</b> — 竊得 ${stolen.join('、')}！`, 'skill');
                _SFX.skill();
                renderHand(); renderOppHandUI(); updateHUDs();
            }
            _maybeSyncHost(); return;
        }
        // 桃園結義：己方所有受傷武將各回 1 HP
        if (card.name.includes('桃園結義')) {
            _consumeHandCard(handIndex, card);
            let healed = 0;
            [...myBoard.active, ...myBoard.bench].forEach(c => {
                if (c && c.hp > 0 && c.hp < c.maxHp) { const h = Math.floor(c.maxHp * 0.20); c.hp = Math.min(c.maxHp, c.hp + h); healed++; }
            });
            if (healed > 0) {
                toast(`🍑 <b>桃園結義</b> — 義氣相扶，${healed} 名武將各回復約 20% 體力！`, 'heal');
                _SFX.heal();
            } else {
                toast('🍑 <b>桃園結義</b> — 己方武將均已滿血，無需治療！', 'info');
            }
            renderBoard(); updateHUDs();
            _maybeSyncHost(); return;
        }
        // 南蠻入侵：對手每名武將必須打出一張殺，否則受 1 傷
        if (card.name.includes('南蠻入侵')) {
            _consumeHandCard(handIndex, card);
            toast('⚔ <b>南蠻入侵</b> — 敵方各武將必須出一張【殺】，否則受 1 傷！', 'attack');
            _SFX.attack();
            const nanTargets = [...oppBoard.active, ...oppBoard.bench].filter(c => c && c.hp > 0);
            let nanDelay = 400;
            nanTargets.forEach(tgt => {
                setTimeout(() => {
                    const killIdx = oppHandData.findIndex(c => c.name && c.name.includes('殺'));
                    if (killIdx !== -1) {
                        const kc = oppHandData.splice(killIdx, 1)[0];
                        oppBoard.discard.push(kc);
                        toast(`🛡 <b>${tgt.name}</b> 打出【${kc.name}】應對南蠻入侵！`, 'info', 1500);
                        renderOppHandUI();
                    } else {
                        const tgtZone = oppBoard.active.includes(tgt) ? 'active' : 'bench';
                        const tgtIdx  = tgtZone === 'active' ? oppBoard.active.indexOf(tgt) : oppBoard.bench.indexOf(tgt);
                        tgt.hp = Math.max(0, tgt.hp - 25);
                        spawnDmgPopup(25, getSlotEl('opp-' + tgtZone + '-zone', tgtIdx));
                        toast(`⚔ <b>${tgt.name}</b> 無法應對，受 25 點傷害！`, 'danger', 1500);
                        if (tgt.hp <= 0) {
                            execOnDeath(tgt, oppBoard, false); // C-2 Fix
                            execOnKill(null, tgt, true);
                            oppBoard[tgtZone][tgtIdx] = null;
                            oppBoard.discard.push(tgt);
                            renderOppBoard(); updateHUDs();
                            if (checkWinCondition()) { _maybeSyncHost(); return; } // C-2 Fix
                        }
                    }
                    renderOppBoard(); updateHUDs();
                }, nanDelay);
                nanDelay += 700;
            });
            setTimeout(() => { checkWinCondition(); _maybeSyncHost(); }, nanDelay + 200);
            return;
        }
        // 萬箭齊發：對手每名武將必須打出一張固守，否則受 25 傷
        if (card.name.includes('萬箭齊發')) {
            _consumeHandCard(handIndex, card);
            toast('🏹 <b>萬箭齊發</b> — 敵方各武將必須出一張【固守】，否則受 25 傷！', 'attack');
            _SFX.attack();
            const wanTargets = [...oppBoard.active, ...oppBoard.bench].filter(c => c && c.hp > 0);
            let wanDelay = 400;
            wanTargets.forEach(tgt => {
                setTimeout(() => {
                    const dodgeIdx = oppHandData.findIndex(c => c.name && c.name.includes('固守'));
                    if (dodgeIdx !== -1) {
                        const dc = oppHandData.splice(dodgeIdx, 1)[0];
                        oppBoard.discard.push(dc);
                        toast(`🛡 <b>${tgt.name}</b> 打出【固守】躲避萬箭！`, 'info', 1500);
                        renderOppHandUI();
                    } else {
                        const tgtZone = oppBoard.active.includes(tgt) ? 'active' : 'bench';
                        const tgtIdx  = tgtZone === 'active' ? oppBoard.active.indexOf(tgt) : oppBoard.bench.indexOf(tgt);
                        tgt.hp = Math.max(0, tgt.hp - 25);
                        spawnDmgPopup(25, getSlotEl('opp-' + tgtZone + '-zone', tgtIdx));
                        toast(`🏹 <b>${tgt.name}</b> 無法閃避，受 25 點傷害！`, 'danger', 1500);
                        if (tgt.hp <= 0) {
                            execOnDeath(tgt, oppBoard, false); // C-2 Fix
                            execOnKill(null, tgt, true);
                            oppBoard[tgtZone][tgtIdx] = null;
                            oppBoard.discard.push(tgt);
                            renderOppBoard(); updateHUDs();
                            if (checkWinCondition()) { _maybeSyncHost(); return; } // C-2 Fix
                        }
                    }
                    renderOppBoard(); updateHUDs();
                }, wanDelay);
                wanDelay += 700;
            });
            setTimeout(() => { checkWinCondition(); _maybeSyncHost(); }, wanDelay + 200);
            return;
        }
        // 五穀豐登：翻開4張牌，雙方輪流各選一張
        if (card.name.includes('五穀豐登')) {
            _consumeHandCard(handIndex, card);
            _execWuGu();
            return;
        }
        // ── 後勤系統卡 ──────────────────────────────────
        // 糧道暢通：友方後勤武將各回復 20% 儲備，補抽 1 張
        if (card.name.includes('糧道暢通')) {
            _consumeHandCard(handIndex, card);
            let healCount = 0;
            [...myBoard.active, ...myBoard.bench].forEach(c => {
                if (c && c.type === '後勤' && c.hp < c.maxHp) {
                    const h = Math.floor(c.maxHp * 0.20);
                    c.hp = Math.min(c.maxHp, c.hp + h);
                    spawnDmgPopup(h, getSlotEl(myBoard.active.includes(c) ? 'my-active-zone' : 'my-bench-zone',
                        (myBoard.active.includes(c) ? myBoard.active : myBoard.bench).indexOf(c)), true);
                    healCount++;
                }
            });
            toast(`🚚 <b>糧道暢通</b> — ${healCount > 0 ? `${healCount} 名後勤武將儲備回滿！` : '後勤武將均已滿儲備。'}`, 'heal');
            _SFX.heal();
            renderBoard();
            setTimeout(() => drawCard(true), 400);
            _maybeSyncHost(); return;
        }
        // 截斷糧道：移除敵方一名後勤武將；否則對所有敵方造成 30 傷害
        if (card.name.includes('截斷糧道')) {
            _consumeHandCard(handIndex, card);
            const oppLogistics = [
                ...oppBoard.active.map((c,i) => c && c.type === '後勤' ? {c,z:'active',i} : null),
                ...oppBoard.bench.map((c,i)  => c && c.type === '後勤' ? {c,z:'bench',i}  : null)
            ].filter(Boolean);
            if (oppLogistics.length > 0) {
                const tgt = oppLogistics[Math.floor(Math.random() * oppLogistics.length)];
                toast(`✂ <b>截斷糧道</b> — 截斷 <b>${tgt.c.name}</b> 的補給線，強制退場！`, 'attack');
                _SFX.attack();
                execOnDeath(tgt.c, oppBoard, false);
                oppBoard[tgt.z][tgt.i] = null; oppBoard.discard.push(tgt.c);
                renderOppBoard(); updateHUDs();
            } else {
                toast('✂ <b>截斷糧道</b> — 無後勤目標，改為對所有敵將造成 30 損耗！', 'attack');
                _SFX.attack();
                [...oppBoard.active, ...oppBoard.bench].forEach((c,i) => {
                    if (!c) return;
                    c.hp = Math.max(0, c.hp - 30);
                    const z = i < 5 ? 'opp-active-zone' : 'opp-bench-zone';
                    spawnDmgPopup(30, getSlotEl(z, i < 5 ? i : i - 5));
                    if (c.hp <= 0) { oppBoard[i < 5 ? 'active' : 'bench'][i < 5 ? i : i-5] = null; oppBoard.discard.push(c); }
                });
                renderOppBoard(); updateHUDs();
            }
            checkWinCondition(); _maybeSyncHost(); return;
        }
        // ── 內政系統卡 ──────────────────────────────────
        // 安撫民心：友方所有內政武將各回復 20% 民心，主公恢復 30 兵力
        if (card.name.includes('安撫民心')) {
            _consumeHandCard(handIndex, card);
            let healed = 0;
            [...myBoard.active, ...myBoard.bench].forEach(c => {
                if (c && c.type === '內政' && c.hp < c.maxHp) {
                    const h = Math.floor(c.maxHp * 0.20);
                    c.hp = Math.min(c.maxHp, c.hp + h); healed++;
                }
            });
            const myM = myBoard.active[2];
            if (myM) { myM.hp = Math.min(myM.maxHp, myM.hp + 30); }
            toast(`🌾 <b>安撫民心</b> — ${healed} 名內政官員民心回復，主公兵力 +30！`, 'heal');
            _SFX.heal(); renderBoard(); updateHUDs(); _maybeSyncHost(); return;
        }
        // 橫徵暴斂：對敵方所有內政武將造成其最大民心 20% 的傷害，棄置敵 1 張手牌
        if (card.name.includes('橫徵暴斂')) {
            _consumeHandCard(handIndex, card);
            let hit = 0;
            [...oppBoard.active, ...oppBoard.bench].forEach((c, i) => {
                if (!c || c.type !== '內政') return;
                const dmg = Math.floor(c.maxHp * 0.20);
                c.hp = Math.max(0, c.hp - dmg); hit++;
                const z = i < 5 ? 'opp-active-zone' : 'opp-bench-zone';
                spawnDmgPopup(dmg, getSlotEl(z, i < 5 ? i : i-5));
                if (c.hp <= 0) { oppBoard[i < 5 ? 'active' : 'bench'][i < 5 ? i : i-5] = null; oppBoard.discard.push(c); }
            });
            if (hit > 0) {
                toast(`💸 <b>橫徵暴斂</b> — ${hit} 名內政官員民心大損！`, 'attack');
            } else {
                toast('💸 <b>橫徵暴斂</b> — 對手無內政武將，暴斂無效！', 'warn');
            }
            if (oppHandData.length > 0) {
                const di = Math.floor(Math.random() * oppHandData.length);
                const dropped = oppHandData.splice(di, 1)[0];
                oppBoard.discard.push(dropped);
                toast(`📜 暴斂餘波 — 對手 <b>${dropped.name}</b> 被強制棄置！`, 'attack', 2000);
                renderOppHandUI();
            }
            _SFX.attack(); renderOppBoard(); updateHUDs(); checkWinCondition(); _maybeSyncHost(); return;
        }
        // ── 監察系統卡 ──────────────────────────────────
        // 反間計：強制棄置對手 2 張手牌；若己方有監察武將加棄 1 張
        if (card.name.includes('反間計')) {
            _consumeHandCard(handIndex, card);
            const myJiancha = [...myBoard.active, ...myBoard.bench].some(c => c && c.type === '監察');
            const discardCount = myJiancha ? 3 : 2;
            let actual = 0;
            for (let i = 0; i < discardCount && oppHandData.length > 0; i++) {
                const di = Math.floor(Math.random() * oppHandData.length);
                const d = oppHandData.splice(di, 1)[0];
                oppBoard.discard.push(d); actual++;
            }
            toast(`🔒 <b>反間計</b> — 情報滲透！對手被迫棄置 ${actual} 張手牌${myJiancha ? '（監察加成）' : ''}！`, 'attack');
            _SFX.attack(); renderOppHandUI(); updateHUDs(); _maybeSyncHost(); return;
        }
        // 刺探情報：從對手手牌竊取 1 張牌，並顯示其剩餘手牌
        if (card.name.includes('刺探情報')) {
            _consumeHandCard(handIndex, card);
            if (oppHandData.length === 0) {
                toast('🕵 <b>刺探情報</b> — 對手手牌為空，諜報無果！', 'warn');
                _maybeSyncHost(); return;
            }
            // 竊取最有用的一張（殺>固守>桃>其他）
            const priority = ['殺','突擊','固守','休整','酒'];
            let stealIdx = -1;
            for (const kw of priority) {
                stealIdx = oppHandData.findIndex(c => c.name && c.name.includes(kw));
                if (stealIdx !== -1) break;
            }
            if (stealIdx === -1) stealIdx = 0;
            const stolen = oppHandData.splice(stealIdx, 1)[0];
            initCharCard(stolen); // 從敵方手牌竊來的武將卡，HP 可能尚未初始化
            myHand.push(stolen);
            // 顯示剩餘手牌情報
            const remaining = oppHandData.map(c => c.name).join('、') || '（已空）';
            toast(`🕵 <b>刺探情報</b> — 竊得 <b>${stolen.name}</b>！對手餘牌：${remaining}`, 'gold', 5000);
            _SFX.skill(); renderHand(); renderOppHandUI(); updateHUDs(); _maybeSyncHost(); return;
        }
        // ── 緊急補給：後勤緊急恢復（sp18）──────────────────
        // 所有後勤武將回復 40% 儲備；若儲備低危，額外再回復 20%，且本回合後勤武將標記免傷
        if (card.name.includes('緊急補給')) {
            _consumeHandCard(handIndex, card);
            const isCrit = isSystemCritical(myBoard, '後勤');
            let healed = 0;
            [...myBoard.active, ...myBoard.bench].forEach(c => {
                if (c && c.type === '後勤') {
                    const h = Math.floor(c.maxHp * (isCrit ? 0.60 : 0.40));
                    c.hp = Math.min(c.maxHp, c.hp + h); healed++;
                    c._emergencyShield = true; // 本回合免傷標記
                }
            });
            const extra = isCrit ? '（危機加成 +20%）' : '';
            toast(`🚚 <b>緊急補給</b> — ${healed} 名後勤武將儲備大幅回復${extra}，並獲本回合免傷！`, 'heal', 3000);
            _SFX.heal(); renderBoard(); updateHUDs(); _maybeSyncHost(); return;
        }
        // ── 勸諫書：內政緊急恢復（sp19）──────────────────────
        // 所有內政武將回復 30% 民心；若民心低危，主公額外恢復 50 兵力，並抽 1 張牌
        if (card.name.includes('勸諫書')) {
            _consumeHandCard(handIndex, card);
            const isCritDom = isSystemCritical(myBoard, '內政');
            let healedDom = 0;
            [...myBoard.active, ...myBoard.bench].forEach(c => {
                if (c && c.type === '內政') {
                    const h = Math.floor(c.maxHp * 0.30);
                    c.hp = Math.min(c.maxHp, c.hp + h); healedDom++;
                }
            });
            let extraMsg = '';
            if (isCritDom) {
                const myM = myBoard.active[2];
                if (myM) { myM.hp = Math.min(myM.maxHp, myM.hp + 50); }
                drawCard(true);
                extraMsg = '，主公兵力 +50 並補抽 1 張';
            }
            toast(`📜 <b>勸諫書</b> — ${healedDom} 名內政官員民心回復${extraMsg}！`, 'heal', 3000);
            _SFX.heal(); renderBoard(); updateHUDs(); _maybeSyncHost(); return;
        }
        // ── 整頓綱紀：監察緊急恢復（sp20）─────────────────────
        // 若忠誠低危，恢復所有監察武將至 50% 忠誠；否則全體回復 30% 並令對手棄 1 張牌
        if (card.name.includes('整頓綱紀')) {
            _consumeHandCard(handIndex, card);
            const isCritInsp = isSystemCritical(myBoard, '監察');
            let healedInsp = 0;
            [...myBoard.active, ...myBoard.bench].forEach(c => {
                if (c && c.type === '監察') {
                    const target = isCritInsp ? Math.floor(c.maxHp * 0.50) : Math.floor(c.maxHp * 0.30);
                    if (isCritInsp) c.hp = Math.max(c.hp, target);
                    else c.hp = Math.min(c.maxHp, c.hp + target);
                    healedInsp++;
                }
            });
            let extraMsg2 = '';
            if (!isCritInsp && oppHandData.length > 0) {
                const di2 = Math.floor(Math.random() * oppHandData.length);
                const purged2 = oppHandData.splice(di2, 1)[0];
                oppBoard.discard.push(purged2);
                extraMsg2 = `，對手棄置 <b>${purged2.name}</b>`;
                renderOppHandUI();
            }
            const modeMsg = isCritInsp ? '（危機：強制恢復至 50%）' : '（回復 30%）';
            toast(`👁 <b>整頓綱紀</b> — ${healedInsp} 名監察官員忠誠整頓${modeMsg}${extraMsg2}！`, 'heal', 3000);
            _SFX.skill(); renderBoard(); updateHUDs(); _maybeSyncHost(); return;
        }
        if (card.type === '突發事件' || card.name.includes('固守')) {
            toast(`⚠ <b>${card.name}</b> 是響應型卡，請留在手牌等待觸發！`, 'warn');
            return;
        }
        // Generic spell
        _consumeHandCard(handIndex, card);
        toast(`✨ 發動 <b>${card.name}</b>！${card.desc}`, 'skill');
        // 制衡（孫權）：打出計策卡後 50% 補抽一張
        const sunquan = myBoard.active[2];
        if (sunquan && sunquan.skillName === '制衡' && Math.random() < 0.5) {
            toast(`⚖ <b>${sunquan.name} · 制衡</b> — 計謀得益，額外補牌！`, 'skill');
            setTimeout(() => drawCard(true), 300);
        }
        // 鹽鐵（桑弘羊）：打出計策卡後回復約 5% HP
        const sanghy = [...myBoard.active, ...myBoard.bench].find(c => c && c.skillName === '鹽鐵');
        if (sanghy && sanghy.hp < sanghy.maxHp) {
            const sanghyHeal = Math.floor(sanghy.maxHp * 0.05);
            sanghy.hp = Math.min(sanghy.maxHp, sanghy.hp + sanghyHeal);
            spawnDmgPopup(sanghyHeal, null, true);
            toast(`💰 <b>${sanghy.name} · 鹽鐵</b> — 計策盈利，回復 ${sanghyHeal} HP！`, 'heal');
            _SFX.heal();
            renderBoard();
        }
        _maybeSyncHost();
        return;
    }

    // ─── CHARACTER CARDS ──────────────────────────────
    _placeCharacterCard(handIndex, card, myBoard, true);
}

/** 放置人物牌到陣地 (通用引擎) */
function _placeCharacterCard(handIndex, card, board, isPlayer) {
    let placed = false;
    const sideName = isPlayer ? '我' : '敵';
    const sideClass = isPlayer ? 'my' : 'opp';
    const hand = isPlayer ? myHand : oppHandData;

    if (card.type === '君王') {
        if (board.active[2] !== null) {
            if (isPlayer) toast('⚠ 主公專屬位已有人了！', 'warn');
            return false;
        }
        initCharCard(card);
        hand.splice(handIndex, 1);
        board.active[2] = card;
        toast(`${isPlayer ? '👑' : '👺'} <b>${card.name}</b> ${isPlayer ? '君臨主將區' : '降臨戰場'}！`, isPlayer ? 'gold' : 'danger');
        placed = true;
    } else if (card.type === '大將軍' || card.type === '將軍') {
        const si = board.active.findIndex((s, i) => s === null && i !== 2);
        if (si === -1) {
            if (isPlayer) toast('⚠ 主將區已滿！', 'warn');
            return false;
        }
        initCharCard(card);
        hand.splice(handIndex, 1);
        board.active[si] = card;
        toast(`${isPlayer ? '⚔' : '🔱'} <b>${card.name}</b> 進駐主將區！`, isPlayer ? 'success' : 'danger');
        placed = true;
        
        // 【技能鉤子：當先】
        if (card.skillName === '當先') {
            toast(`⚡ <b>${card.name} · 當先</b> — 登場免費突擊一次！`, 'skill');
            setTimeout(() => {
                if (isPlayer) {
                    interactionState = {
                        mode:'select_target_enemy',
                        pendingCardIndex:-1,
                        selectedCard:{ name:'突擊(殺)', type:'計策' },
                        attacker: card  // 當先：使用剛登場的武將自身作為攻擊者
                    };
                    showHint('⚡ 當先技能：選擇攻擊目標！');
                    highlightEnemies();
                } else {
                    // AI 的當先邏輯
                    aiExecuteFreeAttack();
                }
            }, 600);
        }
    } else {
        const si = board.bench.findIndex(s => s === null);
        if (si === -1) {
            if (isPlayer) toast('⚠ 後營區已滿！', 'warn');
            return false;
        }
        initCharCard(card);
        hand.splice(handIndex, 1);
        board.bench[si] = card;
        toast(`${isPlayer ? '🏛' : '🏮'} <b>${card.name}</b> 進駐後營區！`, isPlayer ? 'success' : 'danger');
        placed = true;
    }

    if (placed) {
        // 知人善任（劉邦）：每部將上場，主公恢復約 5% HP
        if (card.type !== '君王') {
            const myM = board.active[2];
            const liubang = board.active.find(c => c && c.skillName === '知人善任');
            if (liubang && myM && myM.hp < myM.maxHp) {
                const zhiHeal = Math.floor(myM.maxHp * 0.05);
                myM.hp = Math.min(myM.maxHp, myM.hp + zhiHeal);
                if (isPlayer) toast(`👑 <b>${liubang.name} · 知人善任</b> — 主公恢復 ${zhiHeal} HP！`, 'heal');
                _SFX.heal();
            }
        }

        // 太公望（姜子牙）：新進場武將立即恢復約 5% HP
        const taigong = [...board.active, ...board.bench].find(c => c && c !== card && c.skillName === '太公望');
        if (taigong && card.hp !== '-' && card.hp < card.maxHp) {
            const taiHeal = Math.floor(card.maxHp * 0.05);
            card.hp = Math.min(card.maxHp, card.hp + taiHeal);
            if (isPlayer) toast(`✨ <b>${taigong.name} · 太公望</b> — ${card.name} 進場即恢復 ${taiHeal} HP！`, 'heal');
        }

        // 劫營（甘寧）：進場時對手後排所有武將最大 HP -1（最低為 1）
        if (card.skillName === '劫營') {
            const enemyBoard = isPlayer ? oppBoard : myBoard;
            enemyBoard.bench.forEach(u => {
                if (u) {
                    u.maxHp = Math.max(100, u.maxHp - 60);
                    u.hp    = Math.min(u.hp, u.maxHp);
                }
            });
            if (isPlayer) toast(`🏴‍☠️ <b>${card.name} · 劫營</b> — 敵後營武將最大兵力全 -60！`, 'skill');
        }

        // 六軍鏡（李靖）：進場時為全體現有盟友 maxHp +1；盟友進場時若李靖在場則獲得加成
        const allNow = [...board.active, ...board.bench];
        if (card.skillName === '六軍鏡') {
            allNow.forEach(u => {
                if (u && u !== card && !u._liujingBonus) { u.maxHp += 50; u._liujingBonus = true; }
            });
            if (isPlayer) toast(`⚔ <b>${card.name} · 六軍鏡</b> — 全軍最大兵力 +50！`, 'skill');
        } else {
            const liujing = allNow.find(u => u && u !== card && u.skillName === '六軍鏡');
            if (liujing && card.hp !== '-' && !card._liujingBonus) {
                card.maxHp += 50;
                card._liujingBonus = true;
            }
        }

        // 日月當空（武則天）：敵方下怪 20% 機率直接誘降
        if (!isPlayer) {
            const wuzetian = myBoard.active.find(c => c && c.skillName === '日月當空');
            if (wuzetian && Math.random() < 0.2 && card.type !== '君王') {
                // Remove from opponent board
                const za = oppBoard.active.indexOf(card);
                const zb = oppBoard.bench.indexOf(card);
                if (za !== -1) oppBoard.active[za] = null;
                else if (zb !== -1) oppBoard.bench[zb] = null;
                oppBoard.discard.push(card);
                toast(`🌙 <b>${wuzetian.name} · 日月當空</b> — 誘降 <b>${card.name}</b>！`, 'gold', 3000);
                _SFX.skill();
                renderOppBoard(); renderOppHandUI(); updateHUDs();
                checkWinCondition(); // M-19：誘降後需檢查勝負（可能移除關鍵武將）
                return true;
            }
        }

        if (card.skillName) toast(`💫 <b>${card.name} · ${card.skillName}</b> 待命！`, 'skill');
        _SFX.place();
        if (isPlayer) { renderHand(); renderBoard(); }
        else { renderOppHandUI(); renderOppBoard(); }
        updateHUDs();
        _maybeSyncHost();

        // 入場動畫
        setTimeout(() => {
            const uid = card.uid;
            if (uid) {
                const el = document.querySelector(`.card[data-uid="${uid}"]`);
                if (el) { el.classList.add('card-entering'); setTimeout(() => el.classList.remove('card-entering'), 400); }
            }
        }, 30);
    }
    return placed;
}

/** AI 執行免費突擊 (用於技能觸發) */
function aiExecuteFreeAttack() {
    const targets = myBoard.active.map((c,i) => ({c,i})).filter(o => o.c !== null);
    if (targets.length > 0) {
        const target = targets[Math.floor(Math.random() * targets.length)];
        toast(`⚡ 敵軍發動【當先】突擊！`, 'danger');
        setTimeout(() => promptPlayerDefense(target.c, target.i, 'active'), 1000);
    }
}

/** 客方出牌處理（發送意圖給主機） */
function _guestHandCardAction(handIndex, card) {
    const isAction = card.type === '計策' || card.type === '突發事件' || card.isBasic;

    if (isAction) {
        // 客方殺牌：自動選取第一個可用武將作為攻擊者，直接進入目標選擇
        const isAnyKillG = card.name.includes('突擊') || card.name.includes('火殺') ||
                           card.name.includes('雷殺') || card.name.includes('水殺');
        if (isAnyKillG) {
            const autoAttacker = myBoard.active.find(c => c !== null && c.atk) || myBoard.active.find(c => c !== null);
            interactionState = { mode:'select_target_enemy', pendingCardIndex:handIndex, selectedCard:card, attacker:autoAttacker };
            const emoji = card.name.includes('火殺') ? '🔥' : card.name.includes('雷殺') ? '⚡' : card.name.includes('水殺') ? '💧' : '⚔';
            showHint(`${emoji} 選擇攻擊目標（點擊對手武將）`);
            highlightEnemies();
            return;
        }
        if (card.name.includes('休整')) {
            interactionState = { mode:'select_target_ally', pendingCardIndex:handIndex, selectedCard:card };
            showHint('💚 選擇回復目標（點擊我方武將）');
            highlightAllies();
            return;
        }
        if (card.name.includes('釜底抽薪')) {
            interactionState = { mode:'select_target_enemy', pendingCardIndex:handIndex, selectedCard:card };
            showHint('🔥 選擇後營目標（點擊對手後勤）');
            highlightEnemies();
            return;
        }
        if (card.name.includes('草船借箭')) {
            myHand.splice(handIndex, 1);
            renderHand();
            toast('🏹 【草船借箭】送出，等待主機結算...', 'skill');
            Network.send('guest_action', { type:'spell', spellType:'草船借箭', cardUid:card.uid });
            return;
        }
        if (card.type === '突發事件' || card.name.includes('固守')) {
            toast(`⚠ <b>${card.name}</b> 是響應型卡，請留在手牌！`, 'warn');
            return;
        }
        // Generic spell
        myHand.splice(handIndex, 1);
        renderHand();
        toast(`✨ 發動 <b>${card.name}</b>！`, 'skill');
        Network.send('guest_action', { type:'spell', spellType:'generic', cardUid:card.uid, cardName:card.name });
        return;
    }

    // 人物牌：本地樂觀更新 + 發送給主機
    let target = 'bench';
    if (card.type === '君王' || card.type === '大將軍' || card.type === '將軍') target = 'active';

    initCharCard(card); // HP×100 + ATK/DEF（客方本地更新也需初始化）

    // 客方的 myBoard 映射到主機的 oppBoard
    let placed = false;
    if (target === 'active') {
        if (card.type === '君王' && myBoard.active[2] === null) {
            myBoard.active[2] = card; placed = true;
        } else {
            const si = myBoard.active.findIndex((s, i) => s === null && i !== 2);
            if (si !== -1) { myBoard.active[si] = card; placed = true; }
        }
    } else {
        const si = myBoard.bench.findIndex(s => s === null);
        if (si !== -1) { myBoard.bench[si] = card; placed = true; }
    }

    if (!placed) { toast('⚠ 陣地已滿！', 'warn'); return; }
    myHand.splice(handIndex, 1);
    renderHand(); renderBoard();
    toast(`⚔ <b>${card.name}</b> 已部署！`, 'success');
    Network.send('guest_action', { type:'deploy_char', cardUid:card.uid, cardData:card, target });
}

function _consumeHandCard(index, card) {
    myHand.splice(index, 1);
    myBoard.discard.push(card);
    renderHand();
    updateHUDs();
}

function consumeHandCard(index, card) { _consumeHandCard(index, card); }

/** 僅在主機模式下同步 */
function _maybeSyncHost() {
    if (window.GAME_MODE === 'host' && typeof syncStateToGuest === 'function') {
        syncStateToGuest(false);
    }
}

// ==============================================================
//  BOARD CLICK HANDLERS
// ==============================================================
function handleMyBoardClick(card, zone, idx) {
    // ── 選擇出擊武將 ──
    if (interactionState.mode === 'select_attacker') {
        if (!card || !card.atk) { toast('⚠ 此武將沒有攻擊能力！', 'warn'); return; }
        interactionState.attacker = card;
        interactionState.mode = 'select_target_enemy';
        clearHighlights();
        const sel = interactionState.selectedCard;
        const emoji = sel && sel.name.includes('火殺') ? '🔥' : sel && sel.name.includes('雷殺') ? '⚡' : sel && sel.name.includes('水殺') ? '💧' : '⚔';
        showHint(`${emoji} <b>${card.name}</b>（攻:${card.atk} 守:${card.def}）→ 選擇敵方目標`);
        highlightEnemies();
        return;
    }

    if (interactionState.mode === 'select_target_ally') {
        if (card.hp >= card.maxHp) { toast('⚠ 血量已滿！', 'warn'); return; }

        if (window.GAME_MODE === 'guest') {
            // 客方：樂觀更新 + 通知主機
            const healAmt = Math.floor(card.maxHp * 0.20);
            card.hp = Math.min(card.maxHp, card.hp + healAmt);
            spawnDmgPopup(healAmt, getSlotEl('my-' + zone + '-zone', idx), true);
            toast(`💚 <b>${card.name}</b> 恢復 ${healAmt} HP！`, 'heal');
            Network.send('guest_action', { type:'heal', targetZone:zone, targetIdx:idx });
            _consumeHandCard(interactionState.pendingCardIndex, interactionState.selectedCard);
            interactionState = { mode:'idle', pendingCardIndex:-1, selectedCard:null };
            clearHighlights(); hideHint();
            renderBoard(); updateHUDs();
            return;
        }

        // AI / 主機
        const healAmt = Math.floor(card.maxHp * 0.20);
        card.hp = Math.min(card.maxHp, card.hp + healAmt);
        spawnDmgPopup(healAmt, getSlotEl('my-' + zone + '-zone', idx), true);
        toast(`💚 <b>${card.name}</b> 恢復 ${healAmt} 兵力！(兵力 ${card.hp}/${card.maxHp})`, 'heal');
        _consumeHandCard(interactionState.pendingCardIndex, interactionState.selectedCard);
        interactionState = { mode:'idle', pendingCardIndex:-1, selectedCard:null };
        clearHighlights(); hideHint();
        renderBoard(); updateHUDs();
        _maybeSyncHost();
    }
}

function handleOppCardClick(card, zone, idx) {
    if (interactionState.mode !== 'select_target_enemy') return;

    clearHighlights(); hideHint();
    const sel = interactionState.selectedCard;

    // ── 客方：發送攻擊意圖給主機 ──
    if (window.GAME_MODE === 'guest') {
        if (sel.name && sel.name.includes('釜底抽薪')) {
            if (zone !== 'bench') {
                toast('⚠ 只能瞄準後營目標！', 'warn');
                showHint('🔥 選擇後營目標');
                highlightEnemies();
                return;
            }
            if (interactionState.pendingCardIndex >= 0) {
                const c = myHand.splice(interactionState.pendingCardIndex, 1)[0];
                renderHand();
                Network.send('guest_action', {
                    type:'spell', spellType:'釜底抽薪',
                    cardUid:c.uid, targetZone:zone, targetIdx:idx
                });
            }
        } else {
            // 突擊
            if (interactionState.pendingCardIndex >= 0) {
                myHand.splice(interactionState.pendingCardIndex, 1);
                renderHand();
            }
            // C-3 Fix：傳送攻擊者 ATK，讓主機端能正確計算傷害
            const _atk = interactionState.attacker ? (interactionState.attacker.atk || 60) : 60;
            Network.send('guest_action', { type:'attack', targetZone:zone, targetIdx:idx, attackerAtk:_atk });
            toast('⚔ 攻擊指令已送出，等待主機結算...', 'info', 2500);
        }
        interactionState = { mode:'idle', pendingCardIndex:-1, selectedCard:null, attacker:null };
        return;
    }

    // ── 主機 / AI 攻擊 ──
    if (sel.name && sel.name.includes('釜底抽薪')) {
        if (zone !== 'bench') { toast('⚠ 只能瞄準後營目標！', 'warn'); showHint('🔥 選擇後營目標'); highlightEnemies(); return; }

        // 萬里長城（秦始皇）：後營免疫一切魔法破壞
        const wallKing = oppBoard.active[2];
        if (wallKing && wallKing.skillName === '萬里長城') {
            toast(`🏯 <b>${wallKing.name} · 萬里長城</b> — 後營不可侵犯，釜底抽薪失效！`, 'skill');
            interactionState = { mode:'idle', pendingCardIndex:-1, selectedCard:null };
            clearHighlights(); hideHint();
            return;
        }

        const slotEl = getSlotEl('opp-bench-zone', idx);
        spawnSkillFx('🔥', slotEl);
        toast(`🔥 <b>釜底抽薪</b> — ${card.name} 遭到強制破壞！`, 'attack');
        execOnDeath(card, oppBoard, false);
        oppBoard.bench[idx] = null;
        oppBoard.discard.push(card);
        if (interactionState.pendingCardIndex >= 0) _consumeHandCard(interactionState.pendingCardIndex, sel);
        interactionState = { mode:'idle', pendingCardIndex:-1, selectedCard:null, attacker:null };
        renderOppBoard(); updateHUDs();
        _maybeSyncHost();
        return;
    }

    // ── 突擊對手武將 ──
    let { unDodgeable, ignoreFirstDodge, extraDmg, hasAoE, hasFireLianYing, hasFengLang } = execAttackMods(myBoard);
    // 取得實際攻擊者
    const attacker = interactionState.attacker || myBoard.active.find(c => c !== null);
    const isFire    = sel && sel.name && sel.name.includes('火殺');
    const isThunder = sel && sel.name && sel.name.includes('雷殺');
    const isWater   = sel && sel.name && sel.name.includes('水殺');
    if (isFire) unDodgeable = true;
    // 計算基礎傷害（使用攻擊者 ATK）
    const baseAtk   = attacker ? attacker.atk : 60;
    const mult      = isThunder ? 1.5 : 1.0;
    let baseDmg     = Math.floor(baseAtk * mult) + extraDmg;
    // 酒 buff
    if (wineBuff > 0 && sel && sel.name && (sel.name.includes('殺') || sel.name.includes('突擊'))) {
        const wb = wineBuff; wineBuff = 0;
        const wineBonus = Math.floor(baseAtk * 0.30 * wb);
        baseDmg += wineBonus;
        toast(`🍷 <b>酒勁爆發</b>（${attacker?.name || '未知武將'}）— 額外 ${wineBonus} 傷！`, 'skill'); // H-7 Fix
    }
    // 火殺：完全無視防禦，不減 DEF
    let dmg = isFire ? baseDmg : Math.max(1, baseDmg - (card.def || 0));
    if (unDodgeable) toast(`⚔ <b>${isFire ? '火殺' : '霸王'}</b> — 攻擊無法閃避！`, 'skill');
    if (ignoreFirstDodge) toast('⚔ <b>水戰</b> — 無視對手第一張固守！', 'skill');

    // 在主機模式下：如果對手（客方）有防禦卡，向客方詢問
    if (window.GAME_MODE === 'host' && Network.connected) {
        const guestHasDodge = !unDodgeable && oppHandData.some(c =>
            c.name && (c.name.includes('固守') || c.name.includes('空城計') || c.name.includes('突擊')));

        if (guestHasDodge) {
            if (interactionState.pendingCardIndex >= 0) _consumeHandCard(interactionState.pendingCardIndex, sel);
            interactionState = { mode:'idle', pendingCardIndex:-1, selectedCard:null, attacker:null };
            window._pendingHostAttack = { card, zone, idx, dmg };
            Network.send('host_attacking', {
                targetZone:zone, targetIdx:idx, targetName:card.name, dmg, unDodgeable, ignoreFirstDodge
            });
            toast('⚔ 攻擊中... 等待對手響應', 'info', 3000);
            // 防禦逾時保護：30 秒無回應視為硬扛
            if (window._defenseTimeout) clearTimeout(window._defenseTimeout);
            window._defenseTimeout = setTimeout(() => {
                if (!window._pendingHostAttack) return;
                toast('⏱ 對手防禦逾時，自動硬扛！', 'warn', 2500);
                if (typeof window._guestDefenseAutoTake === 'function') {
                    window._guestDefenseAutoTake();
                }
            }, 30000);
            return;
        }
    }

    // 無詢問需求，直接計算
    // 水戰：AI 有固守但被水戰無視
    const canDodge = !unDodgeable && !ignoreFirstDodge && (window.GAME_MODE === 'ai') && Math.random() < 0.3;
    if (canDodge) {
        spawnSkillFx('🛡', getSlotEl('opp-' + zone + '-zone', idx));
        const dodgeDmg = Math.max(0, baseDmg - (card.def||0)*2);
        if (dodgeDmg > 0) {
            dmg = dodgeDmg;
            dmg = execDefenseMods(card, dmg);
            card.hp = Math.max(0, card.hp - dmg);
            spawnDmgPopup(dmg, getSlotEl('opp-' + zone + '-zone', idx));
            toast(`🛡 <b>${card.name}</b> 固守減傷！（防禦削減至 ${dmg}）`, 'info');
        } else {
            toast(`🛡 <b>${card.name}</b> 固守完全格擋！`, 'info');
            _SFX.dodge();
        }
    } else {
        // DEF already factored in baseDmg calculation above
        dmg = execDefenseMods(card, dmg);

        // 封狼居胥（霍去病）：50% 機率秒殺 HP ≤ 15% 的目標
        if (hasFengLang && card.hp <= Math.floor(card.maxHp * 0.15) && Math.random() < 0.5) {
            card.hp = 0;
            toast(`🐺 <b>霍去病 · 封狼居胥</b> — 飲馬瀚海，斬殺弱敵！`, 'skill');
            _SFX.skill();
        } else {
            card.hp = Math.max(0, card.hp - dmg); // H-3 Fix：防止 HP 出現負數
        }

        spawnSkillFx('⚔', getSlotEl('opp-' + zone + '-zone', idx));
        spawnDmgPopup(dmg, getSlotEl('opp-' + zone + '-zone', idx));
        _SFX.attack();
        execDamageResponse(card, false);

        if (card.hp > 0) {
            toast(`⚔ 命中！<b>${card.name}</b> 受到 ${dmg} 點傷害！(兵力 ${card.hp}/${card.maxHp})`, 'attack');
            // 籌謀（李善長）：命中後補抽 1 張
            const lishanzhang = [...myBoard.active, ...myBoard.bench].find(c => c && c.skillName === '籌謀');
            if (lishanzhang) {
                toast(`📜 <b>${lishanzhang.name} · 籌謀</b> — 一擊得計，補抽 1 張！`, 'skill');
                setTimeout(() => drawCard(true), 400);
            }
            // 破陣（藍玉）：命中後磨去對手牌庫頂 1 張
            const pozheng = myBoard.active.find(c => c && c.skillName === '破陣');
            if (pozheng && oppDeck.length > 0) {
                oppBoard.discard.push(oppDeck.pop());
                toast(`⚔ <b>${pozheng.name} · 破陣</b> — 磨去對手 1 張牌！`, 'skill');
            }
            // 火燒連營（陸遜）：擊中君主，追加 25 傷害給隨機敵將
            if (hasFireLianYing && card.type === '君王') {
                const extras = [...oppBoard.active, ...oppBoard.bench].filter(u => u && u !== card && u.hp > 0);
                if (extras.length > 0) {
                    const extraTgt = extras[Math.floor(Math.random() * extras.length)];
                    const ei = oppBoard.active.indexOf(extraTgt) !== -1 ? oppBoard.active.indexOf(extraTgt) : 0;
                    extraTgt.hp = Math.max(0, extraTgt.hp - 25);
                    spawnDmgPopup(25, getSlotEl('opp-active-zone', ei));
                    toast(`🔥 <b>火燒連營</b> — 連環引燃，波及 ${extraTgt.name}！`, 'danger', 2000);
                }
            }
        } else {
            card.hp = 0;
            spawnSkillFx('💀', getSlotEl('opp-' + zone + '-zone', idx));
            toast(`💀 <b>${card.name}</b> 戰死沙場！`, 'danger', 3500);
            _SFX.death();
            const killAttacker = attacker || myBoard.active.find(c => c !== null);

            // 再造（郭子儀）：全場限一次復活
            if (card.skillName === '再造' && !card._reborn) {
                card._reborn = true;
                card.hp = card.maxHp;
                toast(`✨ <b>${card.name} · 再造</b> — 奇蹟復活！全場限一次`, 'gold', 3000);
                _SFX.heal();
                renderOppBoard(); updateHUDs();
                // 直接跳過清除邏輯
            } else {
                execOnKill(killAttacker, card, true);
                oppBoard[zone][idx] = null;
                oppBoard.discard.push(card);
            }
        }

        // AoE（火燒赤壁）：波及相鄰目標
        if (hasAoE) setTimeout(() => execAoEDamage(idx, zone, true), 400);

        // 水殺：命中後補抽一張牌
        if (sel && sel.name && sel.name.includes('水殺')) {
            toast('💧 <b>水殺</b> — 水到渠成，補抽一張牌！', 'skill');
            setTimeout(() => drawCard(true), 500);
        }

        // 強襲技能：打出突擊後補抽一張牌
        const qiangxiUnit = myBoard.active.find(c => c && c.skillName === '強襲');
        if (qiangxiUnit) {
            toast(`🃏 <b>${qiangxiUnit.name} · 強襲</b> — 補充兵源，補抽 1 張！`, 'skill');
            setTimeout(() => drawCard(true), 300);
        }
    }

    if (interactionState.pendingCardIndex >= 0) _consumeHandCard(interactionState.pendingCardIndex, sel);
    interactionState = { mode:'idle', pendingCardIndex:-1, selectedCard:null, attacker:null };
    renderOppBoard(); updateHUDs();
    _maybeSyncHost();

    if (!checkWinCondition() && window.GAME_MODE !== 'host') {
        // 正常流程繼續
    }
}

// ==============================================================
//  HIGHLIGHT
// ==============================================================
function highlightEnemies() {
    const { canAttackBench } = execAttackMods(myBoard);
    const sel = interactionState.selectedCard;
    const isFuDi = sel && sel.name && sel.name.includes('釜底抽薪');

    if (isFuDi) {
        // 釜底抽薪只高亮後排
        document.querySelectorAll('#opp-bench-zone .card-slot').forEach(s => {
            if (s.querySelector('.card')) s.classList.add('highlight');
        });
    } else {
        // 一般突擊：前排必選，有長驅直入可選後排
        document.querySelectorAll('#opp-active-zone .card-slot').forEach(s => {
            if (s.querySelector('.card')) s.classList.add('highlight');
        });
        if (canAttackBench) {
            document.querySelectorAll('#opp-bench-zone .card-slot').forEach(s => {
                if (s.querySelector('.card')) s.classList.add('highlight');
            });
        }
    }
}
function highlightAllies() {
    document.querySelectorAll('#my-active-zone .card-slot, #my-bench-zone .card-slot').forEach(s => {
        if (s.querySelector('.card')) s.classList.add('highlight');
    });
}
function highlightAttackers() {
    document.querySelectorAll('#my-active-zone .card-slot').forEach(s => {
        const cardEl = s.querySelector('.card');
        if (cardEl) s.classList.add('highlight-attacker');
    });
}
function clearHighlights() {
    document.querySelectorAll('.card-slot.highlight, .card-slot.highlight-attacker').forEach(s => {
        s.classList.remove('highlight');
        s.classList.remove('highlight-attacker');
    });
}

// ==============================================================
//  WIN CONDITION
// ==============================================================
function checkWinCondition() {
    // ── 大將軍/將軍 陣亡條件 ─────────────────────────────────
    const myGenDeaths = myBoard.discard.filter(c => c.type === '大將軍' || c.type === '將軍').length;
    if (myGenDeaths >= 2) {
        toast('💀 我方兩位大將軍/將軍相繼陣亡，軍心崩潰！', 'danger', 3500);
        _SFX.lose(); triggerGameOver(false); return true;
    }
    const oppGenDeaths = oppBoard.discard.filter(c => c.type === '大將軍' || c.type === '將軍').length;
    if (oppGenDeaths >= 2) {
        toast('🏆 敵方兩位大將軍/將軍相繼陣亡，敵軍潰散！', 'gold', 3500);
        _SFX.win(); if (window.GAME_MODE === 'host') Network.send('game_over',{winnerMsg:'🏆 主機獲勝！',hostWon:true}); triggerGameOver(true); return true;
    }

    // ── 我方系統崩潰 → 我方敗 ────────────────────────────────
    if (isSystemCritical(myBoard, '後勤')) {
        toast('🌾 後勤崩潰！糧草告急，<b>捉襟見肘</b>，軍隊無以為繼！', 'danger', 3500);
        _SFX.lose(); triggerGameOver(false); return true;
    }
    if (isSystemCritical(myBoard, '內政')) {
        toast('🏛 民心盡失！<b>民怨四起</b>，王朝根基動搖！', 'danger', 3500);
        _SFX.lose(); triggerGameOver(false); return true;
    }
    if (isSystemCritical(myBoard, '監察')) {
        toast('👁 忠誠崩潰！<b>人人自危</b>，臣心離散！', 'danger', 3500);
        _SFX.lose(); triggerGameOver(false); return true;
    }

    // ── 敵方系統崩潰 → 我方勝 ────────────────────────────────
    if (isSystemCritical(oppBoard, '後勤')) {
        toast('🏆 敵方糧道斷絕，<b>捉襟見肘</b>，敵軍不戰自潰！', 'gold', 3500);
        _SFX.win(); if (window.GAME_MODE === 'host') Network.send('game_over',{winnerMsg:'🏆 主機獲勝！',hostWon:true}); triggerGameOver(true); return true;
    }
    if (isSystemCritical(oppBoard, '內政')) {
        toast('🏆 敵境<b>民怨四起</b>，後方大亂，敵軍渙散！', 'gold', 3500);
        _SFX.win(); if (window.GAME_MODE === 'host') Network.send('game_over',{winnerMsg:'🏆 主機獲勝！',hostWon:true}); triggerGameOver(true); return true;
    }
    if (isSystemCritical(oppBoard, '監察')) {
        toast('🏆 敵方<b>人人自危</b>，叛亂四起，土崩瓦解！', 'gold', 3500);
        _SFX.win(); if (window.GAME_MODE === 'host') Network.send('game_over',{winnerMsg:'🏆 主機獲勝！',hostWon:true}); triggerGameOver(true); return true;
    }

    // ── 敵方全軍覆沒且無牌可打 ───────────────────────────────
    const oppForces = [...oppBoard.active, ...oppBoard.bench].filter(c => c !== null);
    if (oppForces.length === 0 && oppHandData.length === 0 && oppDeck.length === 0) {
        if (window.GAME_MODE === 'host') Network.send('game_over', { winnerMsg: '🏆 主機獲勝！', hostWon: true });
        _SFX.win(); triggerGameOver(true); return true;
    }
    // ── 擊殺對方君主 ─────────────────────────────────────────
    const oppMonarch = oppBoard.active[2];
    if (oppMonarch && oppMonarch.hp <= 0) {
        toast(`👑 <b>${oppMonarch.name}</b> 君主陣亡！`, 'gold', 3000);
        oppBoard.active[2] = null; oppBoard.discard.push(oppMonarch);
        if (window.GAME_MODE === 'host') Network.send('game_over', { winnerMsg: '🏆 主機獲勝！', hostWon: true });
        _SFX.win(); triggerGameOver(true); return true;
    }
    // ── 我方君主陣亡 ─────────────────────────────────────────
    const myMonarch = myBoard.active[2];
    if (myMonarch && myMonarch.hp <= 0) {
        toast(`💔 <b>${myMonarch.name}</b> 君主陣亡！城破國滅！`, 'danger', 3000);
        if (window.GAME_MODE === 'host') Network.send('game_over', { winnerMsg: '🏆 客方獲勝！', hostWon: false });
        _SFX.lose(); triggerGameOver(false); return true;
    }
    return false;
}

/** 寫入英雄榜：以玩家暱稱為 key，更新最高連勝紀錄 */
function _saveLeaderboardRecord(name, bestStreak) {
    try {
        const board = JSON.parse(localStorage.getItem('hua_leaderboard') || '[]');
        const existing = board.find(r => r.name === name);
        if (existing) {
            if (bestStreak > existing.bestStreak) {
                existing.bestStreak = bestStreak;
                existing.updatedAt  = Date.now();
            }
        } else {
            board.push({ name, bestStreak, updatedAt: Date.now() });
        }
        localStorage.setItem('hua_leaderboard', JSON.stringify(board));
    } catch (e) {
        console.error('[Leaderboard] 寫入失敗:', e);
    }
}

function triggerGameOver(win) {
    if (!gameActive) return; // L-8 Fix：防止雙重觸發
    gameActive = false;
    window.gameActive = false;

    // 清除觀戰廣播狀態
    _clearSpectateState();

    // 教學模式：強制清除教學面板與輪詢器，避免殘留在結束畫面之上
    if (window.TUTORIAL_MODE && typeof window._endTutorial === 'function') {
        if (win) localStorage.setItem('hua_tutorial_done', '1'); // L-10 Fix：教學勝利解鎖成就
        window._endTutorial(false);
    }

    // 清除房間聊天紀錄
    localStorage.removeItem('hua_chat_room');
    
    // 結算經濟：基礎獎勵 + 回合加成 (每回合2兩，上限20兩)
    const baseReward = win ? 50 : 20;
    const roundBonus = Math.min(turnCount * 2, 20);
    const totalReward = baseReward + roundBonus;

    if (typeof window.playerSilver !== 'undefined') {
        window.playerSilver += totalReward;
        
        // --- 連勝邏輯（僅計 PvP，AI 對戰不累積）---
        const isPvP = window.GAME_MODE === 'host' || window.GAME_MODE === 'guest';
        let currStreak = parseInt(localStorage.getItem('hua_current_streak') || '0');
        let bestStreak = parseInt(localStorage.getItem('hua_best_streak') || '0');

        if (isPvP) {
            if (win) {
                currStreak++;
                if (currStreak > bestStreak) {
                    bestStreak = currStreak;
                    _saveLeaderboardRecord(window.playerNickname || '無名英雄', bestStreak);
                }
            } else {
                currStreak = 0;
            }
            localStorage.setItem('hua_current_streak', currStreak.toString());
            localStorage.setItem('hua_best_streak', bestStreak.toString());
        }
        // ----------------

        // --- 寫入 Firebase 對戰記錄 ---
        // H-1 Fix：PvP 時只由 host 端寫入，guest 端不重複
        const _shouldRecord = !isPvP || window.GAME_MODE === 'host';
        if (_shouldRecord && typeof Auth !== 'undefined' && Auth.current()) {
            const opponent = window.opponentNickname || (isPvP ? '未知對手' : 'AI 對手');
            Auth.recordBattle(window.GAME_MODE || 'ai', win, opponent, turnCount, totalReward).then(() => {
                // 對戰記錄寫入後，立即檢查成就
                if (typeof window._checkAchievements === 'function') window._checkAchievements();
            });

            // ELO 更新（僅 PvP 且 Host 端執行，避免雙重計算）
            if (isPvP && window.GAME_MODE === 'host' && window.opponentUsername) {
                const myUser = Auth.current().username;
                const oppUser = window.opponentUsername;
                const winner = win ? myUser : oppUser;
                const loser  = win ? oppUser : myUser;
                Auth.recordGameResult(winner, loser).then(result => {
                    if (result) {
                        const myDelta  = win ? result.delta : -result.delta;
                        const myNewElo = win ? result.winnerNew : result.loserNew;
                        toast(`📊 ELO ${myDelta >= 0 ? '+' : ''}${myDelta}（${myNewElo}分）`, win ? 'gold' : 'info', 3000);
                        // Bug Fix #8：更新記憶體中的 ELO，成就系統才能正確判斷
                        const cur = Auth.current();
                        if (cur) cur.elo = myNewElo;
                    }
                });
            }
        }
        // ----------------

        // 立即存檔
        if (typeof window._saveCollection === 'function') {
            window._saveCollection();
        }
        
        // 更新大廳 HUD (若存在)
        if (typeof window._updateHUD === 'function') {
            window._updateHUD();
        }
        
        const streakMsg = win ? `🔥 連勝中：${currStreak}` : `💀 連勝中斷`;
        toast(`💰 結算：${win ? '勝利' : '敗北'} 獲得 ${totalReward} 銀兩！ ${streakMsg}`, win ? 'success' : 'warn', 5000);
    }

    setTimeout(() => {
        const gs = document.getElementById('game-over-screen');
        if (gs) gs.classList.remove('hidden');
        const icon  = document.getElementById('gameover-icon');
        const title = document.getElementById('gameover-title');
        const sub   = document.getElementById('gameover-sub');
        if (icon)  icon.innerText  = win ? '🏆' : '💔';
        if (title) title.innerText = win ? '天下一統！' : '城破國滅…';
        if (sub)   sub.innerText   = win
            ? `您以 ${turnCount} 回合的智謀擊敗了強敵，名垂青史！\n獲得 ${totalReward} 銀兩 (${baseReward} + ${roundBonus} 回合獎勵)`
            : `您的政權已落幕，後人將如何評說？\n獲得 ${totalReward} 銀兩補償 (${baseReward} + ${roundBonus} 回合獎勵)`;

        // ── 按鈕行為（依遊戲模式決定）──
        const isOnline = window.GAME_MODE === 'host' || window.GAME_MODE === 'guest';
        const btnAgain  = document.getElementById('btn-play-again');
        const btnLobby  = document.getElementById('btn-return-lobby');

        if (btnAgain) btnAgain.onclick = () => {
            if (isOnline) {
                if (typeof window._rematchOnline === 'function') window._rematchOnline();
                else location.reload();
            } else {
                if (typeof window._rematchAi === 'function') window._rematchAi();
                else location.reload();
            }
        };
        // 動態更新按鈕文字，提示玩家配對方式
        if (btnAgain) btnAgain.textContent = isOnline ? '⚔ 再玩一場（配對玩家）' : '⚔ 再玩一場';

        if (btnLobby) btnLobby.onclick = () => {
            if (typeof window._goToLobby === 'function') window._goToLobby();
            else location.reload();
        };
    }, 1200);
}

// ==============================================================
//  APPLY HOST STATE (客方收到同步封包後呼叫)
// ==============================================================
function applyHostState(state) {
    if (window.GAME_MODE !== 'guest') return;

    myBoard.active  = state.guestBoard.active  || [null,null,null,null,null];
    myBoard.bench   = state.guestBoard.bench   || [null,null,null,null,null];
    myBoard.discard = state.guestBoard.discard || [];

    oppBoard.active  = state.hostBoard.active  || [null,null,null,null,null];
    oppBoard.bench   = state.hostBoard.bench   || [null,null,null,null,null];
    oppBoard.discard = state.hostBoard.discard || [];

    if (state.guestHand) {
        myHand = state.guestHand;
        myHand.forEach(c => c && initCharCard(c)); // 網路同步的手牌可能尚未 HP×100
    }

    // 用 hostHandCount 建立假的對手手牌陣列（只顯示背面）
    oppHandData = Array.from({ length: state.hostHandCount || 0 },
        (_, i) => ({ id:`h${i}`, uid:`h${i}`, type:'?', name:'?', dynasty:'?', hp:'-', maxHp:'-', desc:'?' }));

    // 牌庫用長度計
    myDeck  = Array.from({ length: state.guestDeckCount || 0 }, () => ({}));
    oppDeck = Array.from({ length: state.hostDeckCount  || 0 }, () => ({}));

    currentPhaseIndex = (state.phase !== undefined) ? state.phase : 2;
    turnCount         = state.turnCount || 1;
    isPlayerTurn      = !!state.isGuestTurn;

    renderAll();

    const btn = document.getElementById('end-turn-btn');
    if (isPlayerTurn) {
        showHint('⚔ 輪到您的回合！點擊出牌或攻擊');
        if (btn) { btn.disabled = false; btn.classList.add('pulse-btn'); }
    } else {
        showHint('⏳ 等待對手行動...');
        if (btn) { btn.disabled = true;  btn.classList.remove('pulse-btn'); }
    }
}

// ==============================================================
//  AI OPPONENT
// ==============================================================
function startOpponentTurn() {
    if (!gameActive) return;

    // ── 教學模式：AI 直接跳過，僅做象徵性動作 ──
    if (window.TUTORIAL_MODE) {
        isPlayerTurn = false;
        updateHUDs();
        toast('🤖 對手思考中…', 'info', 1200);
        setTimeout(() => {
            // 對手從牌堆抽一張（視覺）
            if (oppDeck.length > 0) { oppHandData.push(oppDeck.pop()); renderOppHandUI(); }
            turnCount++;
            toast('🤖 對手結束回合。', 'info', 1200);
            setTimeout(startMyTurn, 1400);
        }, 1600);
        return;
    }

    // ── 主機模式：召喚客方回合，不跑 AI ──
    if (window.GAME_MODE === 'host') {
        isPlayerTurn = false;
        turnCount++;
        currentPhaseIndex = 0;
        updateHUDs();
        toast(`🔴 第 ${turnCount} 回合 — 對手（玩家）回合，等待中...`, 'danger', 2000);
        showHint('⏳ 等待對手行動...');
        const btn = document.getElementById('end-turn-btn');
        if (btn) btn.disabled = true;

        if (oppDeck.length > 0) { oppHandData.push(oppDeck.pop()); renderOppHandUI(); }
        execTurnStartSkills(false);
        currentPhaseIndex = 2;

        if (typeof syncStateToGuest === 'function') syncStateToGuest(true);
        return;
    }

    // ── AI 模式 ──
    isPlayerTurn = false;
    currentPhaseIndex = 0;
    turnCount++;
    // 紅色閃屏
    const _gc = document.getElementById('game-container');
    if (_gc) { _gc.classList.remove('my-turn-flash'); void _gc.offsetWidth; _gc.classList.add('opp-turn-flash'); setTimeout(() => _gc.classList.remove('opp-turn-flash'), 800); }
    toast(`🔴 第 ${turnCount} 回合 — 對手回合！`, 'danger', 2000);
    updateHUDs();

    if (oppDeck.length > 0) { oppHandData.push(oppDeck.pop()); renderOppHandUI(); updateHUDs(); }
    execTurnStartSkills(false);
    setTimeout(aiDeployPhase, 1200);
}

function aiDeployPhase() {
    let deployedCount = 0;
    // 限制 AI 每回合嘗試招喚的數量，避免一次打光
    const maxTries = 2; 

    for (let i = oppHandData.length - 1; i >= 0 && deployedCount < maxTries; i--) {
        const card = oppHandData[i];
        const isChar = !['計策','突發事件'].includes(card.type);

        if (isChar) {
            const success = _placeCharacterCard(i, card, oppBoard, false);
            if (success) deployedCount++;
        }
    }

    if (deployedCount > 0) {
        renderOppBoard(); renderOppHandUI(); updateHUDs();
    }
    setTimeout(aiAttackPhase, deployedCount > 0 ? 1600 : 900);
}

function aiAttackPhase() {
    if (!gameActive) return;

    // ─ 優先：用草船借箭補牌（若牌少）
    const caoIdx = oppHandData.findIndex(c => c.name && c.name.includes('草船借箭'));
    if (caoIdx !== -1 && oppHandData.length < 4) {
        const card = oppHandData.splice(caoIdx, 1)[0];
        oppBoard.discard.push(card);
        for (let i = 0; i < 2 && oppDeck.length > 0; i++) oppHandData.push(oppDeck.pop());
        toast(`🏹 對手發動<b>草船借箭</b>，補充軍備！`, 'info', 2000);
        renderOppHandUI(); updateHUDs();
        setTimeout(aiAttackPhase, 900);
        return;
    }

    // ─ 新卡：桃園結義（有多個殘血武將時使用）
    const taoIdx = oppHandData.findIndex(c => c.name && c.name.includes('桃園結義'));
    const woundedCount = [...oppBoard.active, ...oppBoard.bench].filter(c => c && c.hp > 0 && c.hp < c.maxHp).length;
    if (taoIdx !== -1 && woundedCount >= 2) {
        const taoCard = oppHandData.splice(taoIdx, 1)[0];
        oppBoard.discard.push(taoCard);
        let taoHealed = 0;
        [...oppBoard.active, ...oppBoard.bench].forEach(c => {
            if (c && c.hp > 0 && c.hp < c.maxHp) { const h = Math.floor(c.maxHp * 0.20); c.hp = Math.min(c.maxHp, c.hp + h); taoHealed++; }
        });
        toast(`🍑 對手發動<b>桃園結義</b>，${taoHealed} 名武將各回復約 20% 體力！`, 'info', 2000);
        _SFX.heal();
        renderOppBoard(); renderOppHandUI(); updateHUDs();
        setTimeout(aiAttackPhase, 900); return;
    }

    // ─ 新卡：南蠻入侵（若玩家有多名武將）
    const nanIdx = oppHandData.findIndex(c => c.name && c.name.includes('南蠻入侵'));
    const myActiveCount = myBoard.active.filter(c => c !== null).length;
    if (nanIdx !== -1 && myActiveCount >= 2) {
        const nanCard = oppHandData.splice(nanIdx, 1)[0];
        oppBoard.discard.push(nanCard);
        renderOppHandUI();
        _promptWuXie('南蠻入侵',
            () => { setTimeout(aiAttackPhase, 800); },  // 抵消
            () => {                                       // 生效
        toast('⚔ 對手發動<b>南蠻入侵</b>！你的武將必須各出一張【殺】！', 'danger', 2500);
        _SFX.attack();
        const nanMyTargets = [...myBoard.active, ...myBoard.bench].filter(c => c && c.hp > 0);
        let nanDelay = 500;
        nanMyTargets.forEach(tgt => {
            setTimeout(() => {
                const killIdx = myHand.findIndex(c => c.name && c.name.includes('殺'));
                if (killIdx !== -1) {
                    const kc = myHand.splice(killIdx, 1)[0];
                    myBoard.discard.push(kc);
                    renderHand();
                    toast(`🛡 <b>${tgt.name}</b> 打出【${kc.name}】應對！`, 'success', 1500);
                } else {
                    const tgtZone = myBoard.active.includes(tgt) ? 'active' : 'bench';
                    const tgtIdx  = tgtZone === 'active' ? myBoard.active.indexOf(tgt) : myBoard.bench.indexOf(tgt);
                    tgt.hp = Math.max(0, tgt.hp - 25);
                    spawnDmgPopup(25, getSlotEl('my-' + tgtZone + '-zone', tgtIdx));
                    toast(`⚔ <b>${tgt.name}</b> 無法應對，受 25 點傷害！`, 'danger', 1500);
                    if (tgt.hp <= 0) { execOnKill(null, tgt, true); myBoard[tgtZone][tgtIdx] = null; myBoard.discard.push(tgt); }
                }
                renderBoard(); updateHUDs();
            }, nanDelay);
            nanDelay += 700;
        });
        setTimeout(() => {
            renderOppHandUI(); updateHUDs();
            if (checkWinCondition()) return;
            setTimeout(aiAttackPhase, 700);
        }, nanDelay + 200);
        }); // end _promptWuXie onResolve
        return;
    }

    // ─ 新卡：萬箭齊發（若玩家有多名武將）
    const wanIdx = oppHandData.findIndex(c => c.name && c.name.includes('萬箭齊發'));
    if (wanIdx !== -1 && myActiveCount >= 2) {
        const wanCard = oppHandData.splice(wanIdx, 1)[0];
        oppBoard.discard.push(wanCard);
        renderOppHandUI();
        _promptWuXie('萬箭齊發',
            () => { setTimeout(aiAttackPhase, 800); },  // 抵消
            () => {                                       // 生效
        toast('🏹 對手發動<b>萬箭齊發</b>！你的武將必須各出一張【固守】！', 'danger', 2500);
        _SFX.attack();
        const wanMyTargets = [...myBoard.active, ...myBoard.bench].filter(c => c && c.hp > 0);
        let wanDelay = 500;
        wanMyTargets.forEach(tgt => {
            setTimeout(() => {
                const dodgeIdx = myHand.findIndex(c => c.name && c.name.includes('固守'));
                if (dodgeIdx !== -1) {
                    const dc = myHand.splice(dodgeIdx, 1)[0];
                    myBoard.discard.push(dc);
                    renderHand();
                    toast(`🛡 <b>${tgt.name}</b> 打出【固守】躲避萬箭！`, 'success', 1500);
                } else {
                    const tgtZone = myBoard.active.includes(tgt) ? 'active' : 'bench';
                    const tgtIdx  = tgtZone === 'active' ? myBoard.active.indexOf(tgt) : myBoard.bench.indexOf(tgt);
                    tgt.hp = Math.max(0, tgt.hp - 25);
                    spawnDmgPopup(25, getSlotEl('my-' + tgtZone + '-zone', tgtIdx));
                    toast(`🏹 <b>${tgt.name}</b> 無法閃避，受 25 點傷害！`, 'danger', 1500);
                    if (tgt.hp <= 0) { execOnKill(null, tgt, true); myBoard[tgtZone][tgtIdx] = null; myBoard.discard.push(tgt); }
                }
                renderBoard(); updateHUDs();
            }, wanDelay);
            wanDelay += 700;
        });
        setTimeout(() => {
            renderOppHandUI(); updateHUDs();
            if (checkWinCondition()) return;
            setTimeout(aiAttackPhase, 700);
        }, wanDelay + 200);
        }); // end _promptWuXie onResolve
        return;
    }

    // ─ 新卡：無中生有（牌少時補牌）
    const wuzhIdx = oppHandData.findIndex(c => c.name && c.name.includes('無中生有'));
    if (wuzhIdx !== -1 && oppHandData.length < 3) {
        const wuzhCard = oppHandData.splice(wuzhIdx, 1)[0];
        oppBoard.discard.push(wuzhCard);
        for (let i = 0; i < 2 && oppDeck.length > 0; i++) oppHandData.push(oppDeck.pop());
        toast('✨ 對手發動<b>無中生有</b>，補充手牌！', 'info', 1800);
        renderOppHandUI(); updateHUDs();
        setTimeout(aiAttackPhase, 900); return;
    }

    // ─ 次優先：用休整治療殘血武將
    const healIdx = oppHandData.findIndex(c => c.name && c.name.includes('休整'));
    const woundedUnit = oppBoard.active.find(c => c && c.hp > 0 && c.hp < c.maxHp - 1);
    if (healIdx !== -1 && woundedUnit) {
        const healCard = oppHandData.splice(healIdx, 1)[0];
        oppBoard.discard.push(healCard);
        const aiHealAmt = Math.floor(woundedUnit.maxHp * 0.20);
        woundedUnit.hp = Math.min(woundedUnit.maxHp, woundedUnit.hp + aiHealAmt);
        const wi = oppBoard.active.indexOf(woundedUnit);
        spawnDmgPopup(aiHealAmt, getSlotEl('opp-active-zone', wi), true);
        toast(`💊 對手為 <b>${woundedUnit.name}</b> 施展休整，恢復 ${aiHealAmt} HP！`, 'info', 2000);
        _SFX.heal();
        renderOppBoard(); renderOppHandUI(); updateHUDs();
        setTimeout(aiAttackPhase, 1100);
        return;
    }

    // ─ 釜底抽薪：摧毀玩家後營
    const fudiIdx = oppHandData.findIndex(c => c.name && c.name.includes('釜底抽薪'));
    const playerBenchTarget = myBoard.bench.find(c => c !== null);
    const wallKingPlayer = myBoard.active[2]; // 萬里長城保護
    if (fudiIdx !== -1 && playerBenchTarget && !(wallKingPlayer && wallKingPlayer.skillName === '萬里長城')) {
        const fudiCard = oppHandData.splice(fudiIdx, 1)[0];
        oppBoard.discard.push(fudiCard);
        renderOppHandUI();
        _promptWuXie('釜底抽薪',
            () => { setTimeout(aiAttackPhase, 800); },  // 抵消
            () => {
                const pbi = myBoard.bench.indexOf(playerBenchTarget);
                execOnDeath(playerBenchTarget, myBoard, true);
                myBoard.bench[pbi] = null;
                myBoard.discard.push(playerBenchTarget);
                toast(`🔥 對手發動<b>釜底抽薪</b>，摧毀了 <b>${playerBenchTarget.name}</b>！`, 'danger', 2500);
                renderBoard(); updateHUDs();
                setTimeout(aiAttackPhase, 900);
            }
        );
        return;
    }

    // ─ 酒：若AI準備出殺，先飲酒增傷（50% 機率）
    const jiuAiIdx = oppHandData.findIndex(c => c.name && (c.name === '酒' || c.name.startsWith('酒')));
    const hasKillCard = oppHandData.some(c => c.name && c.name.includes('殺'));
    if (jiuAiIdx !== -1 && hasKillCard && !window._aiWineBuff && Math.random() < 0.55) {
        const jiuAiCard = oppHandData.splice(jiuAiIdx, 1)[0];
        oppBoard.discard.push(jiuAiCard);
        window._aiWineBuff = 1;
        toast('🍷 對手飲酒壯膽，下一擊傷害 +1！', 'info', 1800);
        renderOppHandUI(); updateHUDs();
        setTimeout(aiAttackPhase, 700);
        return;
    }

    // ─ 突擊 / 特殊殺：優先瞄準君主，其次殘血目標
    // 優先使用火殺（必中）對高血量目標，雷殺（2傷）對高血量，水殺一般使用
    const _attackCards = ['火殺', '雷殺', '水殺', '突擊'];
    let atkIdx = -1, atkCardChosen = null;
    for (const kw of _attackCards) {
        const fi = oppHandData.findIndex(c => c.name && c.name.includes(kw));
        if (fi !== -1) { atkIdx = fi; atkCardChosen = oppHandData[fi]; break; }
    }
    const hasGen  = oppBoard.active.some(c => c !== null);
    const targets = myBoard.active
        .map((c, i) => ({ c, i, zone: 'active' }))
        .filter(o => o.c !== null);

    // 若有長驅直入，後排也可瞄準
    const { canAttackBench: aiCanBench } = execAttackMods(oppBoard);
    if (aiCanBench) {
        myBoard.bench.forEach((c, i) => { if (c) targets.push({ c, i, zone: 'bench' }); });
    }

    if (atkIdx !== -1 && hasGen && targets.length > 0) {
        // 優先：君主 → 最低血量
        const monarchTgt = targets.find(t => t.c.type === '君王');
        const target = monarchTgt || targets.reduce((low, t) => t.c.hp < low.c.hp ? t : low, targets[0]);
        const atkCard = oppHandData.splice(atkIdx, 1)[0];
        oppBoard.discard.push(atkCard);
        renderOppHandUI(); updateHUDs();
        const atkEmoji = atkCard.name.includes('火殺') ? '🔥' : atkCard.name.includes('雷殺') ? '⚡' : atkCard.name.includes('水殺') ? '💧' : '⚔';
        toast(`${atkEmoji} 敵軍對 <b>${target.c.name}</b> 發動【${atkCard.name}】！`, 'danger', 2000);
        // 標記特殊殺類型到 promptPlayerDefense，選攻擊力最高的 AI 武將
        window._aiLastAtkCard = atkCard;
        const aiAttacker = [...oppBoard.active].filter(c => c && c.atk).sort((a,b) => b.atk - a.atk)[0];
        window._aiLastAttacker = aiAttacker;
        setTimeout(() => promptPlayerDefense(target.c, target.i, target.zone), 1500);
    } else {
        toast('🔔 對手回合結束。', 'info', 2000);
        setTimeout(startMyTurn, 1800);
    }
}

// ==============================================================
//  DEFENSE MODAL (AI 攻擊玩家時)
// ==============================================================
function openDefenseModal(text, dodgeLabel, takeLabel, onDodge, onTake) {
    const modal    = document.getElementById('defense-modal');
    const textEl   = document.getElementById('defense-text');
    const dodgeBtn = document.getElementById('defense-dodge-btn');
    const takeBtn  = document.getElementById('defense-take-btn');
    if (!modal || !textEl || !dodgeBtn || !takeBtn) return;

    textEl.innerHTML     = text.replace(/\n/g, '<br>');
    dodgeBtn.innerText   = dodgeLabel;
    takeBtn.innerText    = takeLabel;
    dodgeBtn.disabled    = (onDodge === null);
    modal.classList.remove('hidden');

    dodgeBtn.onclick = () => { modal.classList.add('hidden'); if (onDodge) onDodge(); };
    takeBtn.onclick  = () => { modal.classList.add('hidden'); if (onTake)  onTake();  };
}

function promptPlayerDefense(targetCard, zoneIdx, zone) {
    let { unDodgeable, ignoreFirstDodge, extraDmg } = execAttackMods(oppBoard);
    // 特殊殺牌效果（AI攻擊時）
    const _aiAtk = window._aiLastAtkCard;
    const aiAttacker = window._aiLastAttacker;
    const aiBaseAtk = aiAttacker ? aiAttacker.atk : 60;
    let isAiThunder = false;
    let isAiFire = false;
    if (_aiAtk) {
        if (_aiAtk.name && _aiAtk.name.includes('火殺')) { unDodgeable = true; isAiFire = true; toast('🔥 <b>火殺</b> — 無法用固守閃避！', 'skill'); }
        if (_aiAtk.name && _aiAtk.name.includes('雷殺')) { isAiThunder = true; toast('⚡ <b>雷殺</b> — 雷擊威力 1.5×！', 'skill'); }
        window._aiLastAtkCard = null;
    }
    const aiMult = isAiThunder ? 1.5 : 1.0;
    let aiBaseDmg = Math.floor(aiBaseAtk * aiMult) + extraDmg;
    // AI 酒 buff
    if (window._aiWineBuff) {
        const wineBonus = Math.floor(aiBaseAtk * 0.30 * window._aiWineBuff);
        aiBaseDmg += wineBonus;
        window._aiWineBuff = 0;
        toast(`🍷 <b>敵將酒勁發作</b> — 額外 ${wineBonus} 傷！`, 'danger', 1800);
    }
    // 火殺無視防禦；一般攻擊扣除目標 DEF
    let dmg = isAiFire ? aiBaseDmg : Math.max(1, aiBaseDmg - (targetCard.def || 0));
    if (unDodgeable) toast('⚔ 敵將發動鎖定技，突擊必定命中！', 'skill');
    if (ignoreFirstDodge) toast('⚔ 敵將【水戰】 — 您的第一張固守被無視！', 'skill');

    // 築城（徐達）：在場時受到突擊有 30% 機率自動抵消
    const zhuCheng = myBoard.active.find(c => c && c.skillName === '築城');
    if (zhuCheng && !unDodgeable && Math.random() < 0.3) {
        spawnSkillFx('🏯', getSlotEl('my-' + (zone||'active') + '-zone', zoneIdx));
        toast(`🏯 <b>${zhuCheng.name} · 築城</b> — 堅城抵禦，突擊被抵消！`, 'skill', 2500);
        _SFX.dodge();
        setTimeout(() => { toast('🔔 對手回合結束。', 'info', 2000); setTimeout(startMyTurn, 1500); }, 400);
        return;
    }

    // 大隕石術（光武帝劉秀）：每回合首次受攻擊，天火反擊敵方主公 1 HP
    if (targetCard && targetCard.type === '君王' && targetCard.skillName === '大隕石術' && !targetCard._daHitUsed) {
        targetCard._daHitUsed = true;
        const em = oppBoard.active[2];
        if (em) {
            em.hp = Math.max(0, em.hp - 25);
            spawnSkillFx('☄', getSlotEl('opp-active-zone', 2));
            spawnDmgPopup(25, getSlotEl('opp-active-zone', 2));
            toast(`☄ <b>${targetCard.name} · 大隕石術</b> — 天火擊中對方主公！`, 'skill', 2500);
            _SFX.skill();
            renderOppBoard(); updateHUDs();
            if (checkWinCondition()) return;
        }
    }

    const dodgeIdx  = myHand.findIndex(c => c.name && c.name.includes('固守'));
    const spaceIdx  = myHand.findIndex(c => c.name && c.name.includes('空城計'));
    const zhaoYunIdx= (targetCard.skillName === '龍膽')
        ? myHand.findIndex(c => c.name && c.name.includes('突擊')) : -1;
    const hasDodge  = !unDodgeable && !ignoreFirstDodge && (dodgeIdx !== -1 || spaceIdx !== -1 || zhaoYunIdx !== -1);

    let dodgeLabel = '🛡 無防禦可用';
    let onDodge    = null;

    // 固守效果：傷害減去 def×2（完全可能格擋）
    const dodgedDmg = Math.max(0, aiBaseDmg - (targetCard.def || 0) * 2);

    if (hasDodge) {
        if (spaceIdx !== -1) {
            dodgeLabel = '🏯 空城計（完全格擋）';
            onDodge    = () => {
                _consumeHandCard(spaceIdx, myHand[spaceIdx]);
                spawnSkillFx('🏯', getSlotEl('my-' + zone + '-zone', zoneIdx));
                toast(`🏯 <b>空城計</b> — 化解了敵軍突擊！`, 'skill');
                _resolveDefenseDodge();
            };
        } else if (dodgeIdx !== -1) {
            if (dodgedDmg > 0) {
                dodgeLabel = `🛡 固守減傷（受 ${dodgedDmg} 傷）`;
                onDodge    = () => {
                    _consumeHandCard(dodgeIdx, myHand[dodgeIdx]);
                    spawnSkillFx('🛡', getSlotEl('my-' + zone + '-zone', zoneIdx));
                    toast(`🛡 <b>${targetCard.name}</b> 固守減傷！`, 'success');
                    _resolveDefenseTake(targetCard, zoneIdx, zone, dodgedDmg);
                };
            } else {
                dodgeLabel = '🛡 固守完全格擋！';
                onDodge    = () => {
                    _consumeHandCard(dodgeIdx, myHand[dodgeIdx]);
                    spawnSkillFx('🛡', getSlotEl('my-' + zone + '-zone', zoneIdx));
                    toast(`🛡 <b>${targetCard.name}</b> 固守完全格擋！`, 'success');
                    _resolveDefenseDodge();
                };
            }
        } else if (zhaoYunIdx !== -1) {
            dodgeLabel = '🐉 龍膽（以攻代守）';
            onDodge    = () => {
                _consumeHandCard(zhaoYunIdx, myHand[zhaoYunIdx]);
                spawnSkillFx('🐉', getSlotEl('my-' + zone + '-zone', zoneIdx));
                toast(`🐉 <b>趙雲 · 龍膽</b> — 以攻代守！`, 'skill');
                _resolveDefenseDodge();
            };
        }
    }

    openDefenseModal(
        `敵軍突擊 <b>${targetCard.name}</b>！（傷害 ${dmg}）\n${unDodgeable ? '⚠️ 此次攻擊無法閃避！' : '選擇應對方式：'}`,
        dodgeLabel, '💥 硬扛',
        hasDodge ? onDodge : null,
        () => _resolveDefenseTake(targetCard, zoneIdx, zone, dmg)
    );
}

function _resolveDefenseDodge() {
    _SFX.dodge();
    toast('✅ 成功閃避！', 'success', 2000);

    // 奪槊（尉遲恭）：閃避成功時，攻擊者 -25 HP
    const wtg = myBoard.active.find(c => c && c.skillName === '奪槊');
    if (wtg) {
        const dodgeAttacker = oppBoard.active.find(c => c && c.type !== '君王') || oppBoard.active.find(c => c !== null);
        if (dodgeAttacker) {
            const ai = oppBoard.active.indexOf(dodgeAttacker);
            dodgeAttacker.hp = Math.max(0, dodgeAttacker.hp - 25);
            spawnDmgPopup(25, getSlotEl('opp-active-zone', ai));
            toast(`🗡 <b>${wtg.name} · 奪槊</b> — 反奪兵器，刺傷 ${dodgeAttacker.name}！`, 'skill', 2500);
            renderOppBoard(); updateHUDs();
        }
    }

    setTimeout(() => { toast('🔔 對手回合結束。', 'info', 2000); setTimeout(startMyTurn, 1500); }, 500);
}

function _resolveDefenseTake(targetCard, zoneIdx, zone, dmg) {
    dmg = execDefenseMods(targetCard, dmg);
    targetCard.hp -= dmg;
    const slotEl = getSlotEl('my-' + zone + '-zone', zoneIdx);
    spawnDmgPopup(dmg, slotEl);
    _SFX.attack();
    execDamageResponse(targetCard, true);

    // 驍勇（李文忠）：主公受到傷害時，立刻對攻擊者發起反擊
    if (targetCard.type === '君王' && dmg > 0 && targetCard.hp > 0) {
        const liWZ = [...myBoard.active, ...myBoard.bench].find(c => c && c.skillName === '驍勇' && c.hp > 0);
        if (liWZ) {
            const oppAtk = oppBoard.active.find(c => c && c.type !== '君王') || oppBoard.active.find(c => c !== null);
            if (oppAtk) {
                const oi = oppBoard.active.indexOf(oppAtk);
                oppAtk.hp = Math.max(0, oppAtk.hp - 25);
                spawnSkillFx('⚔', getSlotEl('opp-active-zone', oi));
                spawnDmgPopup(25, getSlotEl('opp-active-zone', oi));
                toast(`⚔ <b>${liWZ.name} · 驍勇</b> — 護主反擊，刺傷 ${oppAtk.name}！`, 'skill', 2500);
                renderOppBoard(); updateHUDs();
                if (checkWinCondition()) return;
            }
        }
    }

    // 靖難（朱棣）：受到突擊時，從手牌打出突擊反擊
    if (targetCard.type === '君王' && targetCard.skillName === '靖難' && targetCard.hp > 0) {
        const atkIdx2 = myHand.findIndex(c => c.name && c.name.includes('突擊'));
        if (atkIdx2 !== -1) {
            const counterCard = myHand.splice(atkIdx2, 1)[0];
            myBoard.discard.push(counterCard);
            renderHand();
            const enemy = oppBoard.active.find(c => c !== null && c.type !== '君王') || oppBoard.active[2];
            if (enemy) {
                const ei = oppBoard.active.indexOf(enemy);
                enemy.hp = Math.max(0, enemy.hp - 25);
                spawnSkillFx('🗡', getSlotEl('opp-active-zone', ei));
                spawnDmgPopup(25, getSlotEl('opp-active-zone', ei));
                toast(`⚔ <b>${targetCard.name} · 靖難</b> — 以攻代守，反擊 <b>${enemy.name}</b>！`, 'skill');
                _SFX.attack();
                renderOppBoard(); updateHUDs();
                if (checkWinCondition()) return;
            }
        }
    }

    // 火燒連營（陸遜，AI方）：玩家君主受傷時，追加 25 傷害給玩家隨機武將
    if (targetCard.type === '君王' && dmg > 0) {
        const luXun = [...oppBoard.active, ...oppBoard.bench].find(c => c && c.skillName === '火燒連營' && c.hp > 0);
        if (luXun) {
            const extras = [...myBoard.active, ...myBoard.bench].filter(u => u && u !== targetCard && u.hp > 0);
            if (extras.length > 0) {
                const exTgt = extras[Math.floor(Math.random() * extras.length)];
                const exZone = myBoard.active.indexOf(exTgt) !== -1 ? 'active' : 'bench';
                const exIdx  = exZone === 'active' ? myBoard.active.indexOf(exTgt) : myBoard.bench.indexOf(exTgt);
                exTgt.hp = Math.max(0, exTgt.hp - 25);
                spawnDmgPopup(25, getSlotEl(`my-${exZone}-zone`, exIdx));
                toast(`🔥 <b>${luXun.name} · 火燒連營</b> — 連環引燃，波及 ${exTgt.name}！`, 'danger', 2500);
            }
        }
    }

    if (targetCard.hp > 0) {
        toast(`💥 <b>${targetCard.name}</b> 受到 ${dmg} 傷害！(兵力 ${targetCard.hp}/${targetCard.maxHp})`, 'attack');
        renderBoard(); updateHUDs();
    } else {
        // 網開一面（商湯）：50% 機率從致命傷存活
        if (targetCard.skillName === '網開一面' && !targetCard._wangkaiUsed && Math.random() < 0.5) {
            targetCard._wangkaiUsed = true;
            targetCard.hp = 1;
            toast(`🌟 <b>${targetCard.name} · 網開一面</b> — 天命庇護，留存一息！`, 'gold', 3000);
            _SFX.heal();
            renderBoard(); updateHUDs();
        } else if (targetCard.skillName === '再造' && !targetCard._reborn) {
            // 再造（郭子儀）：全場限一次復活
            targetCard._reborn = true;
            targetCard.hp = targetCard.maxHp;
            toast(`✨ <b>${targetCard.name} · 再造</b> — 奇蹟復活！全場限一次`, 'gold', 3000);
            _SFX.heal();
            renderBoard(); updateHUDs();
        } else {
            // 酒瀕死自救：若手牌有酒，詢問玩家是否使用
            const jiuIdx = myHand.findIndex(c => c.name && (c.name === '酒' || c.name.startsWith('酒')));
            if (jiuIdx !== -1) {
                openDefenseModal(
                    `💀 <b>${targetCard.name}</b> 即將陣亡！\n手中有【酒】，可飲酒回復 1 HP 免於死亡！`,
                    '🍷 飲酒自救（+1 HP）',
                    '❌ 放棄，接受陣亡',
                    () => {
                        _consumeHandCard(jiuIdx, myHand[jiuIdx]);
                        targetCard.hp = 1;
                        toast(`🍷 <b>${targetCard.name}</b> 飲酒自救，以一絲血量存活！`, 'heal');
                        _SFX.heal();
                        renderBoard(); updateHUDs();
                        setTimeout(() => { toast('🔔 對手回合結束。', 'info', 2000); setTimeout(startMyTurn, 1500); }, 400);
                    },
                    () => {
                        targetCard.hp = 0;
                        toast(`💀 <b>${targetCard.name}</b> 壯烈犧牲！`, 'danger', 3500);
                        spawnSkillFx('💀', slotEl);
                        _SFX.death();
                        const oppAttacker2 = oppBoard.active.find(c => c !== null);
                        execOnKill(oppAttacker2, targetCard, false);
                        myBoard[zone][zoneIdx] = null;
                        myBoard.discard.push(targetCard);
                        renderBoard(); updateHUDs();
                        if (checkWinCondition()) return;
                        setTimeout(startMyTurn, 1500);
                    }
                );
                return;
            }
            targetCard.hp = 0;
            toast(`💀 <b>${targetCard.name}</b> 壯烈犧牲！`, 'danger', 3500);
            spawnSkillFx('💀', slotEl);
            _SFX.death();
            const oppAttacker = oppBoard.active.find(c => c !== null);
            execOnKill(oppAttacker, targetCard, false);
            myBoard[zone][zoneIdx] = null;
            myBoard.discard.push(targetCard);

            const oppBaiqiBA = oppBoard.active.find(c => c && c.skillName === '坑殺');
            if (oppBaiqiBA && myBoard.active[2]) {
                myBoard.active[2].hp = Math.max(0, myBoard.active[2].hp - 30);
                spawnDmgPopup(30, getSlotEl('my-active-zone', 2));
                toast(`🩸 <b>${oppBaiqiBA.name} · 坑殺</b> — 波及我方主公！`, 'skill');
                if (myBoard.active[2].hp <= 0) {
                    myBoard.active[2] = null;
                    triggerGameOver(false); return;
                }
            }
            renderBoard(); updateHUDs();
            if (checkWinCondition()) return;
        }
    }
    setTimeout(() => { toast('🔔 對手回合結束。', 'info', 2000); setTimeout(startMyTurn, 1500); }, 600);
}

// ==============================================================
//  無懈可擊 — 通用計策反制檢查
// ==============================================================
/** 在 AI 發動計策時，若玩家手牌有【無懈可擊】則彈出詢問。
 *  @param spellName  計策名稱（用於顯示）
 *  @param onCancel   玩家選擇抵消時的回調
 *  @param onResolve  玩家選擇允許生效（或無牌可用）時的回調
 */
function _promptWuXie(spellName, onCancel, onResolve) {
    const wxIdx = myHand.findIndex(c => c.name && c.name.includes('無懈可擊'));
    if (wxIdx === -1) { onResolve(); return; }
    openDefenseModal(
        `✨ 對手發動【${spellName}】！\n你持有【無懈可擊】，是否抵消此計策效果？`,
        '⚡ 無懈可擊（抵消計策）',
        '🔓 允許計策生效',
        () => {
            _consumeHandCard(wxIdx, myHand[wxIdx]);
            toast(`⚡ <b>無懈可擊</b> — 【${spellName}】被完美抵消！`, 'skill');
            _SFX.skill();
            if (onCancel) onCancel();
        },
        () => { onResolve(); }
    );
}

// ==============================================================
//  五穀豐登 — 翻牌選取
// ==============================================================
function _execWuGu() {
    const revealed = [];
    for (let i = 0; i < 4 && myDeck.length > 0; i++) revealed.push(myDeck.pop());
    if (revealed.length === 0) {
        toast('🌾 <b>五穀豐登</b> — 牌庫已空，無牌可選！', 'warn');
        _maybeSyncHost(); return;
    }
    toast(`🌾 <b>五穀豐登</b> — 翻開 ${revealed.length} 張牌，輪流選取！`, 'skill');
    _SFX.skill();

    const modal = document.createElement('div');
    modal.id = 'wugu-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:9999;display:flex;align-items:center;justify-content:center;';

    const renderWuGu = (isPlayerTurn) => {
        modal.innerHTML = `
            <div style="background:#0d0f14;border:2px solid #b8a060;border-radius:14px;padding:28px 32px;max-width:640px;width:92%;text-align:center;">
                <h3 style="color:#b8a060;margin:0 0 6px;font-size:18px;letter-spacing:2px;">🌾 五穀豐登</h3>
                <p style="color:${isPlayerTurn ? '#aef' : '#faa'};font-size:13px;margin:0 0 20px;">
                    ${isPlayerTurn ? '👆 請選擇一張牌加入手牌' : '🤖 對手正在選牌…'}
                </p>
                <div id="wugu-cards" style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;"></div>
                <p style="color:#555;font-size:11px;margin-top:18px;">剩餘 ${revealed.length} 張</p>
            </div>`;
        const container = modal.querySelector('#wugu-cards');
        revealed.forEach((rc, ri) => {
            const div = document.createElement('div');
            div.style.cssText = `cursor:${isPlayerTurn ? 'pointer' : 'default'};border:2px solid #444;border-radius:10px;padding:12px 10px;background:#1a1c22;min-width:110px;max-width:130px;transition:all 0.2s;`;
            const rarity = rc.type === '君王' ? '#ffd700' : rc.type === '大將軍' ? '#c084fc' : rc.type === '軍師' ? '#60a5fa' : '#aaa';
            div.innerHTML = `
                <div style="font-size:13px;color:${rarity};font-weight:bold;margin-bottom:5px;">${rc.name}</div>
                <div style="font-size:11px;color:#666;margin-bottom:6px;">${rc.type}</div>
                <div style="font-size:11px;color:#888;line-height:1.5;">${(rc.desc||'').slice(0, 40)}…</div>`;
            if (isPlayerTurn) {
                div.onmouseenter = () => { div.style.borderColor = '#b8a060'; div.style.background = '#22241c'; };
                div.onmouseleave = () => { div.style.borderColor = '#444'; div.style.background = '#1a1c22'; };
                div.onclick = () => {
                    initCharCard(rc); // 揭示牌可能是武將卡，加入手牌前先初始化 HP
                    myHand.push(rc);
                    revealed.splice(ri, 1);
                    renderHand(); updateHUDs();
                    toast(`🌾 你獲得了 <b>${rc.name}</b>！`, 'success', 1500);
                    if (revealed.length === 0) { if (modal.parentNode) modal.parentNode.removeChild(modal); _maybeSyncHost(); return; } // L-7 Fix
                    // AI 的回合
                    renderWuGu(false);
                    setTimeout(() => {
                        const aiPref = revealed.find(c => c.type === '計策' || c.isBasic) || revealed[0];
                        const ai = revealed.indexOf(aiPref);
                        revealed.splice(ai, 1);
                        oppHandData.push(aiPref);
                        renderOppHandUI();
                        toast(`🤖 對手獲得了 <b>${aiPref.name}</b>！`, 'info', 1500);
                        if (revealed.length === 0) { if (modal.parentNode) modal.parentNode.removeChild(modal); _maybeSyncHost(); return; } // L-7 Fix
                        // 再次輪到玩家
                        renderWuGu(true);
                    }, 900);
                };
            }
            container.appendChild(div);
        });
        // AI 自動選牌
        if (!isPlayerTurn) {
            // 已由 onclick 中的 setTimeout 處理
        }
    };
    renderWuGu(true);
    document.body.appendChild(modal);
}

// ==============================================================
//  GRAVEYARD
// ==============================================================
function showGraveyard(isPlayer) {
    const modal = document.getElementById('graveyard-modal');
    const title = document.getElementById('graveyard-title');
    const list  = document.getElementById('graveyard-list');
    if (!modal || !title || !list) return;

    title.innerText = isPlayer ? '☠ 我方墳場' : '☠ 敵方墳場';
    list.innerHTML  = '';
    const pile = isPlayer ? myBoard.discard : oppBoard.discard;

    if (pile.length === 0) {
        list.innerHTML = '<p style="color:#888;font-size:16px;text-align:center;margin:30px">墳場空無一物</p>';
    } else {
        [...pile].reverse().forEach(card => {
            const el = makeCardEl(card);
            el.style.cursor = 'default';
            el.addEventListener('mouseenter', () => showPreview(card));
            el.addEventListener('mouseleave', hidePreview);
            list.appendChild(el);
        });
    }
    modal.classList.remove('hidden');
}

function closeGraveyardModal() {
    const m = document.getElementById('graveyard-modal');
    if (m) m.classList.add('hidden');
}

// ==============================================================
//  SPECTATE STATE FUNCTIONS
// ==============================================================
async function _writeSpectateState() {
    if (!gameActive || window.GAME_MODE !== 'host') return;
    if (!window._roomCode) return;

    const myMonarch  = myBoard.active.find(c => c && c.type === '君王')
                    || myBoard.bench.find(c  => c && c.type === '君王');
    const oppMonarch = oppBoard.active.find(c => c && c.type === '君王')
                    || oppBoard.bench.find(c  => c && c.type === '君王');

    const state = {
        hostNick:   window.playerNickname   || '主機玩家',
        guestNick:  window.opponentNickname || '客方玩家',
        hostHp:     myMonarch  ? myMonarch.hp     : 0,
        hostMaxHp:  myMonarch  ? myMonarch.maxHp  : 1,
        guestHp:    oppMonarch ? oppMonarch.hp    : 0,
        guestMaxHp: oppMonarch ? oppMonarch.maxHp : 1,
        hostCards:  myHand.length,
        guestCards: oppHandData.length,
        hostField:  [...myBoard.active,  ...myBoard.bench].filter(Boolean).length,
        guestField: [...oppBoard.active, ...oppBoard.bench].filter(Boolean).length,
        turn:       turnCount,
        isMyTurn:   isPlayerTurn,
        updatedAt:  Date.now()
    };

    try {
        await fetch(`${_SPECTATE_FB}/${window._roomCode}.json`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(state)
        });
    } catch (e) { /* silent — spectate is best-effort */ }
}

async function _clearSpectateState() {
    if (window.GAME_MODE !== 'host' || !window._roomCode) return;
    try {
        await fetch(`${_SPECTATE_FB}/${window._roomCode}.json`, { method: 'DELETE' });
    } catch (e) {}
}

// ==============================================================
//  GLOBAL BINDINGS (供 HTML onclick 呼叫)
// ==============================================================
window.showGraveyard       = showGraveyard;
window.closeGraveyardModal = closeGraveyardModal;
window.toggleBattleLog     = toggleBattleLog;
window.applyHostState      = applyHostState;
