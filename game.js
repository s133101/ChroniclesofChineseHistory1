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

// ---- State ----
let myDeck = [], myHand = [];
let myBoard  = { active:[null,null,null,null,null], bench:[null,null,null,null,null], discard:[] };
let oppDeck = [], oppHandData = [];
let oppBoard = { active:[null,null,null,null,null], bench:[null,null,null,null,null], discard:[] };
let interactionState = { mode:'idle', pendingCardIndex:-1, selectedCard:null };

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
    const myMonarch = { ...targetMonarch, uid: 'init_M_' + Math.random().toString(36).substr(2,9) };
    
    // 保底一張大將軍
    const myGeneral = extract('大將軍');
    
    myHand = [myMonarch, myGeneral];
    for (let i = 0; i < 5; i++) {
        myHand.push(myDeck.pop());
    }
    _shuffleArr(myHand);

    // 十全武功：開局額外攜帶兩張突擊卡
    if (myMonarch.skillName === '十全武功') {
        const atkBase = cardDatabase.find(c => c.name.includes('突擊') && c.isBasic);
        if (atkBase) {
            myHand.push({ ...atkBase, uid: 'qql_1_' + Date.now() });
            myHand.push({ ...atkBase, uid: 'qql_2_' + Date.now() });
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
        if (aiM)  oppBoard.active[2] = aiM;
        if (aiG1) oppBoard.active[1] = aiG1;
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

    // ESC 鍵：取消選目標狀態
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && interactionState.mode !== 'idle') {
            interactionState = { mode:'idle', pendingCardIndex:-1, selectedCard:null };
            clearHighlights(); hideHint();
            _SFX.click();
            toast('⚠ 已取消選擇', 'info', 1500);
        }
    }, { once: false });

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
    if (myMbar)  myMbar.style.width  = _myM  ? `${(_myM.hp/_myM.maxHp)*100}%`   : '0%';
    if (oppMbar) oppMbar.style.width = _oppM ? `${(_oppM.hp/_oppM.maxHp)*100}%` : '0%';
    
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
        ? `<img src="${artValue}" alt="${card.name}">` 
        : artValue;

    const badge = card.skillName
        ? `<div class="skill-badge" title="${card.skillName}">${card.skillName}</div>` : '';
    
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
        hpHtml = `
          <div class="card-hp-bar-wrap">
            <div class="card-hp-bar">
              <div class="card-hp-fill ${cls}" style="width:${pct}%"></div>
            </div>
            <div class="card-hp-text">兵力 ${hp}/${max}</div>
          </div>`;
    }

    el.innerHTML = `
      <div class="card-dynasty">${card.dynasty || ''}</div>
      <div class="card-type">${card.type || ''}</div>
      ${badge}
      <div class="card-art">${artHtml}</div>
      <div class="card-name">${card.name || ''}</div>
      ${symbolHtml}
      ${hpHtml}
    `;
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
        ? `<img src="${artValue}" alt="${card.name}">` 
        : artValue;
    el.innerHTML = `
      <div class="preview-card ${typeClass(card.type)}">
        <div class="preview-header">
          <div class="preview-name">${card.name}</div>
          <div class="preview-meta">[${card.dynasty}] · ${card.type}</div>
        </div>
        <div class="preview-art">${artHtml}</div>
        <div class="preview-body">
          <div class="preview-desc">${card.desc || ''}</div>
          ${card.skillName ? `<div class="preview-skill">
            <div class="preview-skill-name">【${card.skillName}】</div>
            <div class="preview-skill-desc">${card.skillDesc || ''}</div>
          </div>` : ''}
          ${(card.hp !== '-' && card.hp !== undefined) ? `<div class="preview-hp-section">
            <div class="preview-hp-label">❤ HP</div>
            <div class="preview-hp-bar">
              <div class="preview-hp-fill" style="width:${pct}%"></div>
            </div>
            <div class="preview-hp-val">${hp}/${max}</div>
          </div>` : ''}
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
    if (h) { h.innerText = msg; h.classList.remove('hidden'); }
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
            c.hp = Math.max(0, c.hp - 1);
            if (isPlayer) {
                spawnDmgPopup(1, getSlotEl('my-active-zone', board.active.indexOf(c) !== -1 ? board.active.indexOf(c) : 0));
                toast(`☠ <b>${c.name}</b> 毒發傷血 1！`, 'danger', 2000);
                _SFX.poison();
            }
            if (c.hp <= 0) {
                c.hp = 0;
                const zoneKey = board.active.includes(c) ? 'active' : 'bench';
                const zoneIdx = board[zoneKey].indexOf(c);
                board[zoneKey][zoneIdx] = null;
                board.discard.push(c);
                if (isPlayer) renderBoard(); else renderOppBoard();
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
            c.hp++;
            if (isPlayer) { toast(`💚 <b>${c.name} · 穩紮穩打</b> — 恢復 1 HP！`, 'heal'); _SFX.heal(); }
        }

        // ── 開皇之治（隋文帝）── 文臣回血
        if (c.skillName === '開皇之治') {
            board.bench.forEach(b => {
                if (!b || b.hp >= b.maxHp) return;
                b.hp++;
                if (isPlayer) toast(`💚 <b>開皇之治</b> — ${b.name} 恢復 1 HP！`, 'heal');
            });
        }

        // ── 木牛流馬（諸葛亮，後勤）── 回血 + 補牌
        if (c.skillName === '木牛流馬') {
            if (c.hp < c.maxHp) { c.hp++; if (isPlayer) toast(`🌾 <b>${c.name} · 木牛流馬</b> — 恢復 1 HP！`, 'heal'); }
            if (isPlayer) { drawCard(true); toast(`🌾 <b>${c.name} · 木牛流馬</b> — 糧草充足，補給 1 張！`, 'skill'); }
            else { if (oppDeck.length > 0) { oppHandData.push(oppDeck.pop()); renderOppHandUI(); } }
        }

        // ── 青苗法（王安石）── 回血，若君王在場 +2
        if (c.skillName === '青苗法') {
            const monarch = board.active[2];
            const healAmt = monarch ? 2 : 1;
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
                m.maxHp++;
                m._peixiangBonus = bonus + 1;
                if (isPlayer) toast(`✨ <b>${c.name} · 配享</b> — 君主兵力上限 +1！`, 'skill');
            }
        }

        // ── 救時（姚崇）── 隨機為一名武將回復 1 HP
        if (c.skillName === '救時') {
            const wounded = allUnits.filter(u => u && u !== c && u.hp > 0 && u.hp < u.maxHp);
            if (wounded.length > 0) {
                const tgt = wounded[Math.floor(Math.random() * wounded.length)];
                tgt.hp = Math.min(tgt.maxHp, tgt.hp + 1);
                if (isPlayer) toast(`💊 <b>${c.name} · 救時</b> — ${tgt.name} 獲得 1 HP！`, 'heal');
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
                    u.maxHp++;
                    u._liujingBonus = true;
                }
            });
            if (isPlayer) toast(`⚔ <b>${c.name} · 六軍鏡</b> — 全軍最大兵力 +1！`, 'skill');
        }

        // ── 黑衣（姚廣孝）── 對手回合結束時，對敵方無防禦武將造成 1 點傷害
        if (c.skillName === '黑衣' && !isPlayer) {
            // 姚廣孝在 AI 的後營，對玩家前排造成 1 點暗算
            const pTarget = myBoard.active.find(u => u && u.hp > 0);
            if (pTarget) {
                const pi = myBoard.active.indexOf(pTarget);
                pTarget.hp = Math.max(0, pTarget.hp - 1);
                spawnDmgPopup(1, getSlotEl('my-active-zone', pi));
                toast(`🖤 <b>${c.name} · 黑衣</b> — 暗中刺傷 ${pTarget.name}！`, 'danger', 2500);
                _SFX.skill();
            }
        }
    });

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
    // 精忠報國 (岳飛)：己方主公血量 < 3 時，攻擊力翻倍
    const myM = board.active[2];
    if (myM && myM.hp < 3 && board.active.some(c => c && c.skillName === '精忠報國')) extraDmg++;
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
        arr[i].hp = Math.max(0, arr[i].hp - 1);
        spawnDmgPopup(1, getSlotEl(zoneId, i));
        toast(`🔥 <b>火攻連延</b> — ${arr[i].name} 受到 1 點延燒傷害！`, 'danger', 2000);
        if (arr[i].hp <= 0) {
            arr[i].hp = 0;
            toast(`💀 <b>${arr[i].name}</b> 在大火中陣亡！`, 'danger', 3000);
            _SFX.death();
            board.discard.push(arr[i]);
            arr[i] = null;
        }
    });
    if (isPlayerAttacking) renderOppBoard(); else renderBoard();
}

function execDefenseMods(defender, dmg) {
    if (!defender) return dmg;

    // 丹心觸發的免疫狀態
    if (defender._immune) {
        toast(`🛡 <b>${defender.name}</b> 本回合免疫傷害！`, 'skill');
        return 0;
    }

    if (defender.skillName === '天可汗') {
        dmg = Math.max(0, dmg - 1);
        toast(`🛡 <b>${defender.name} · 天可汗</b> — 傷害減免！`, 'skill');
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
                tgtMonarch.hp = Math.max(0, tgtMonarch.hp - 1);
                toast(`🩸 <b>${attacker.name} · 坑殺</b> — 斬殺連累主公！`, 'skill');
                spawnDmgPopup(1, getSlotEl(isPlayerAttacking ? 'opp-active-zone' : 'my-active-zone', 2));
            }
        }
        // 鐵腕（朱元璋）：敵將陣亡，主公恢復 2 HP
        const killerMonarch = isPlayerAttacking ? myBoard.active[2] : oppBoard.active[2];
        if (killerMonarch && killerMonarch.skillName === '鐵腕') {
            killerMonarch.hp = Math.min(killerMonarch.maxHp, killerMonarch.hp + 2);
            toast(`💪 <b>${killerMonarch.name} · 鐵腕</b> — 敵將陣亡，恢復 2 HP！`, 'heal');
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
        if (card.name.includes('突擊')) {
            interactionState = { mode:'select_target_enemy', pendingCardIndex:handIndex, selectedCard:card };
            showHint('🎯 選擇攻擊目標（點擊對手武將）');
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
            _consumeHandCard(handIndex, card);
            toast('🏹 <b>草船借箭</b> — 借得箭矢，抽取兩張牌！', 'skill');
            setTimeout(() => drawCard(true), 100);
            setTimeout(() => drawCard(true), 400);
            _maybeSyncHost();
            return;
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
        // 鹽鐵（桑弘羊）：打出計策卡後回復 1 HP
        const sanghy = [...myBoard.active, ...myBoard.bench].find(c => c && c.skillName === '鹽鐵');
        if (sanghy && sanghy.hp < sanghy.maxHp) {
            sanghy.hp = Math.min(sanghy.maxHp, sanghy.hp + 1);
            spawnDmgPopup(1, null, true);
            toast(`💰 <b>${sanghy.name} · 鹽鐵</b> — 計策盈利，回復 1 HP！`, 'heal');
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
                        selectedCard:{ name:'突擊(殺)', type:'計策' } 
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
        hand.splice(handIndex, 1);
        board.bench[si] = card;
        toast(`${isPlayer ? '🏛' : '🏮'} <b>${card.name}</b> 進駐後營區！`, isPlayer ? 'success' : 'danger');
        placed = true;
    }

    if (placed) {
        // 知人善任（劉邦）：每部將上場，主公恢復 1 HP
        if (card.type !== '君王') {
            const myM = board.active[2];
            const liubang = board.active.find(c => c && c.skillName === '知人善任');
            if (liubang && myM && myM.hp < myM.maxHp) {
                myM.hp = Math.min(myM.maxHp, myM.hp + 1);
                if (isPlayer) toast(`👑 <b>${liubang.name} · 知人善任</b> — 主公恢復 1 HP！`, 'heal');
                _SFX.heal();
            }
        }

        // 太公望（姜子牙）：新進場武將立即恢復 1 HP
        const taigong = [...board.active, ...board.bench].find(c => c && c !== card && c.skillName === '太公望');
        if (taigong && card.hp !== '-' && card.hp < card.maxHp) {
            card.hp = Math.min(card.maxHp, card.hp + 1);
            if (isPlayer) toast(`✨ <b>${taigong.name} · 太公望</b> — ${card.name} 進場即恢復 1 HP！`, 'heal');
        }

        // 劫營（甘寧）：進場時對手後排所有武將最大 HP -1（最低為 1）
        if (card.skillName === '劫營') {
            const enemyBoard = isPlayer ? oppBoard : myBoard;
            enemyBoard.bench.forEach(u => {
                if (u && u.maxHp > 1) {
                    u.maxHp = Math.max(1, u.maxHp - 1);
                    u.hp    = Math.min(u.hp, u.maxHp);
                }
            });
            if (isPlayer) toast(`🏴‍☠️ <b>${card.name} · 劫營</b> — 敵後營武將最大兵力全 -1！`, 'skill');
        }

        // 六軍鏡（李靖）：進場時為全體現有盟友 maxHp +1；盟友進場時若李靖在場則獲得加成
        const allNow = [...board.active, ...board.bench];
        if (card.skillName === '六軍鏡') {
            allNow.forEach(u => {
                if (u && u !== card && !u._liujingBonus) { u.maxHp++; u._liujingBonus = true; }
            });
            if (isPlayer) toast(`⚔ <b>${card.name} · 六軍鏡</b> — 全軍最大兵力 +1！`, 'skill');
        } else {
            const liujing = allNow.find(u => u && u !== card && u.skillName === '六軍鏡');
            if (liujing && card.hp !== '-' && !card._liujingBonus) {
                card.maxHp++;
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
        if (card.name.includes('突擊')) {
            interactionState = { mode:'select_target_enemy', pendingCardIndex:handIndex, selectedCard:card };
            showHint('🎯 選擇攻擊目標（點擊對手武將）');
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
    if (interactionState.mode === 'select_target_ally') {
        if (card.hp >= card.maxHp) { toast('⚠ 血量已滿！', 'warn'); return; }

        if (window.GAME_MODE === 'guest') {
            // 客方：樂觀更新 + 通知主機
            card.hp = Math.min(card.maxHp, card.hp + 1);
            spawnDmgPopup(1, getSlotEl('my-' + zone + '-zone', idx), true);
            toast(`💚 <b>${card.name}</b> 恢復 1 HP！`, 'heal');
            Network.send('guest_action', { type:'heal', targetZone:zone, targetIdx:idx });
            _consumeHandCard(interactionState.pendingCardIndex, interactionState.selectedCard);
            interactionState = { mode:'idle', pendingCardIndex:-1, selectedCard:null };
            clearHighlights(); hideHint();
            renderBoard(); updateHUDs();
            return;
        }

        // AI / 主機
        card.hp = Math.min(card.maxHp, card.hp + 1);
        spawnDmgPopup(1, getSlotEl('my-' + zone + '-zone', idx), true);
        toast(`💚 <b>${card.name}</b> 恢復 1 兵力！(兵力 ${card.hp}/${card.maxHp})`, 'heal');
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
            Network.send('guest_action', { type:'attack', targetZone:zone, targetIdx:idx });
            toast('⚔ 攻擊指令已送出，等待主機結算...', 'info', 2500);
        }
        interactionState = { mode:'idle', pendingCardIndex:-1, selectedCard:null };
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
        interactionState = { mode:'idle', pendingCardIndex:-1, selectedCard:null };
        renderOppBoard(); updateHUDs();
        _maybeSyncHost();
        return;
    }

    // ── 突擊對手武將 ──
    const { unDodgeable, ignoreFirstDodge, extraDmg, hasAoE, hasFireLianYing, hasFengLang } = execAttackMods(myBoard);
    let dmg = 1 + extraDmg;
    if (unDodgeable) toast('⚔ <b>霸王</b> — 突擊無法閃避！', 'skill');
    if (ignoreFirstDodge) toast('⚔ <b>水戰</b> — 無視對手第一張固守！', 'skill');

    // 在主機模式下：如果對手（客方）有防禦卡，向客方詢問
    if (window.GAME_MODE === 'host' && Network.connected) {
        const guestHasDodge = !unDodgeable && oppHandData.some(c =>
            c.name && (c.name.includes('固守') || c.name.includes('空城計') || c.name.includes('突擊')));

        if (guestHasDodge) {
            if (interactionState.pendingCardIndex >= 0) _consumeHandCard(interactionState.pendingCardIndex, sel);
            interactionState = { mode:'idle', pendingCardIndex:-1, selectedCard:null };
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
        toast(`🛡 ${card.name} 打出<b>固守</b>，閃避了您的突擊！`, 'info');
        _SFX.dodge();
    } else {
        dmg = execDefenseMods(card, dmg);

        // 封狼居胥（霍去病）：50% 機率秒殺 HP ≤ 2 的目標
        if (hasFengLang && card.hp <= 2 && Math.random() < 0.5) {
            card.hp = 0;
            toast(`🐺 <b>霍去病 · 封狼居胥</b> — 飲馬瀚海，斬殺弱敵！`, 'skill');
            _SFX.skill();
        } else {
            card.hp -= dmg;
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
            // 火燒連營（陸遜）：擊中君主，追加 1 傷害給隨機敵將
            if (hasFireLianYing && card.type === '君王') {
                const extras = [...oppBoard.active, ...oppBoard.bench].filter(u => u && u !== card && u.hp > 0);
                if (extras.length > 0) {
                    const extraTgt = extras[Math.floor(Math.random() * extras.length)];
                    const ei = oppBoard.active.indexOf(extraTgt) !== -1 ? oppBoard.active.indexOf(extraTgt) : 0;
                    extraTgt.hp = Math.max(0, extraTgt.hp - 1);
                    spawnDmgPopup(1, getSlotEl('opp-active-zone', ei));
                    toast(`🔥 <b>火燒連營</b> — 連環引燃，波及 ${extraTgt.name}！`, 'danger', 2000);
                }
            }
        } else {
            card.hp = 0;
            spawnSkillFx('💀', getSlotEl('opp-' + zone + '-zone', idx));
            toast(`💀 <b>${card.name}</b> 戰死沙場！`, 'danger', 3500);
            _SFX.death();
            const attacker = myBoard.active.find(c => c !== null);

            // 再造（郭子儀）：全場限一次復活
            if (card.skillName === '再造' && !card._reborn) {
                card._reborn = true;
                card.hp = card.maxHp;
                toast(`✨ <b>${card.name} · 再造</b> — 奇蹟復活！全場限一次`, 'gold', 3000);
                _SFX.heal();
                renderOppBoard(); updateHUDs();
                // 直接跳過清除邏輯
            } else {
                execOnKill(attacker, card, true);
                oppBoard[zone][idx] = null;
                oppBoard.discard.push(card);
            }
        }

        // AoE（火燒赤壁）：波及相鄰目標
        if (hasAoE) setTimeout(() => execAoEDamage(idx, zone, true), 400);

        // 強襲技能：打出突擊後補抽一張牌
        const qiangxiUnit = myBoard.active.find(c => c && c.skillName === '強襲');
        if (qiangxiUnit) {
            toast(`🃏 <b>${qiangxiUnit.name} · 強襲</b> — 補充兵源，補抽 1 張！`, 'skill');
            setTimeout(() => drawCard(true), 300);
        }
    }

    if (interactionState.pendingCardIndex >= 0) _consumeHandCard(interactionState.pendingCardIndex, sel);
    interactionState = { mode:'idle', pendingCardIndex:-1, selectedCard:null };
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
function clearHighlights() {
    document.querySelectorAll('.card-slot.highlight').forEach(s => s.classList.remove('highlight'));
}

// ==============================================================
//  WIN CONDITION
// ==============================================================
function checkWinCondition() {
    // 敵方全軍覆沒且無牌可打
    const oppForces = [...oppBoard.active, ...oppBoard.bench].filter(c => c !== null);
    if (oppForces.length === 0 && oppHandData.length === 0 && oppDeck.length === 0) {
        if (window.GAME_MODE === 'host') {
            Network.send('game_over', { winnerMsg: '🏆 主機獲勝！' });
        }
        _SFX.win();
        triggerGameOver(true);
        return true;
    }
    // 擊殺對方君主
    const oppMonarch = oppBoard.active[2];
    if (oppMonarch && oppMonarch.hp <= 0) {
        toast(`👑 <b>${oppMonarch.name}</b> 君主陣亡！`, 'gold', 3000);
        oppBoard.active[2] = null;
        oppBoard.discard.push(oppMonarch);
        if (window.GAME_MODE === 'host') {
            Network.send('game_over', { winnerMsg: '🏆 主機獲勝！' });
        }
        _SFX.win();
        triggerGameOver(true);
        return true;
    }
    // 我方君主陣亡
    const myMonarch = myBoard.active[2];
    if (myMonarch && myMonarch.hp <= 0) {
        toast(`💔 <b>${myMonarch.name}</b> 君主陣亡！城破國滅！`, 'danger', 3000);
        if (window.GAME_MODE === 'host') {
            Network.send('game_over', { winnerMsg: '🏆 客方獲勝！' });
        }
        _SFX.lose();
        triggerGameOver(false);
        return true;
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
    gameActive = false;
    window.gameActive = false;
    
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
                    // 同步寫入英雄榜
                    _saveLeaderboardRecord(window.playerNickname || '無名英雄', bestStreak);
                }
            } else {
                currStreak = 0;
            }
            localStorage.setItem('hua_current_streak', currStreak.toString());
            localStorage.setItem('hua_best_streak', bestStreak.toString());
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
        const icon = document.getElementById('gameover-icon');
        const title = document.getElementById('gameover-title');
        const sub   = document.getElementById('gameover-sub');
        if (icon)  icon.innerText  = win ? '🏆' : '💔';
        if (title) title.innerText = win ? '天下一統！' : '城破國滅…';
        if (sub)   sub.innerText   = win
            ? `您以 ${turnCount} 回合的智謀擊敗了強敵，名垂青史！\n獲得 ${totalReward} 銀兩 (${baseReward} + ${roundBonus} 回合獎勵)`
            : `您的政權已落幕，後人將如何評說？\n獲得 ${totalReward} 銀兩補償 (${baseReward} + ${roundBonus} 回合獎勵)`;
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

    if (state.guestHand) myHand = state.guestHand;

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

    // ─ 次優先：用休整治療殘血武將
    const healIdx = oppHandData.findIndex(c => c.name && c.name.includes('休整'));
    const woundedUnit = oppBoard.active.find(c => c && c.hp > 0 && c.hp < c.maxHp - 1);
    if (healIdx !== -1 && woundedUnit) {
        const healCard = oppHandData.splice(healIdx, 1)[0];
        oppBoard.discard.push(healCard);
        woundedUnit.hp = Math.min(woundedUnit.maxHp, woundedUnit.hp + 1);
        const wi = oppBoard.active.indexOf(woundedUnit);
        spawnDmgPopup(1, getSlotEl('opp-active-zone', wi), true);
        toast(`💊 對手為 <b>${woundedUnit.name}</b> 施展休整，恢復 1 HP！`, 'info', 2000);
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
        const pbi = myBoard.bench.indexOf(playerBenchTarget);
        execOnDeath(playerBenchTarget, myBoard, true);
        myBoard.bench[pbi] = null;
        myBoard.discard.push(playerBenchTarget);
        toast(`🔥 對手發動<b>釜底抽薪</b>，摧毀了 <b>${playerBenchTarget.name}</b>！`, 'danger', 2500);
        renderBoard(); renderOppHandUI(); updateHUDs();
        setTimeout(aiAttackPhase, 900);
        return;
    }

    // ─ 突擊：優先瞄準君主，其次殘血目標
    const atkIdx = oppHandData.findIndex(c => c.name && c.name.includes('突擊'));
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
        toast(`⚔ 敵軍對 <b>${target.c.name}</b> 發動突擊！`, 'danger', 2000);
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
    const { unDodgeable, ignoreFirstDodge, extraDmg } = execAttackMods(oppBoard);
    let dmg = 1 + extraDmg;
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
            em.hp = Math.max(0, em.hp - 1);
            spawnSkillFx('☄', getSlotEl('opp-active-zone', 2));
            spawnDmgPopup(1, getSlotEl('opp-active-zone', 2));
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

    if (hasDodge) {
        if (spaceIdx !== -1) {
            dodgeLabel = '🏯 空城計';
            onDodge    = () => {
                _consumeHandCard(spaceIdx, myHand[spaceIdx]);
                spawnSkillFx('🏯', getSlotEl('my-' + zone + '-zone', zoneIdx));
                toast(`🏯 <b>空城計</b> — 化解了敵軍突擊！`, 'skill');
                _resolveDefenseDodge();
            };
        } else if (dodgeIdx !== -1) {
            dodgeLabel = '🛡 固守閃避';
            onDodge    = () => {
                _consumeHandCard(dodgeIdx, myHand[dodgeIdx]);
                spawnSkillFx('🛡', getSlotEl('my-' + zone + '-zone', zoneIdx));
                toast(`🛡 <b>${targetCard.name}</b> 打出固守，成功閃避！`, 'success');
                _resolveDefenseDodge();
            };
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

    // 奪槊（尉遲恭）：閃避成功時，攻擊者 -1 HP
    const wtg = myBoard.active.find(c => c && c.skillName === '奪槊');
    if (wtg) {
        const attacker = oppBoard.active.find(c => c && c.type !== '君王') || oppBoard.active.find(c => c !== null);
        if (attacker) {
            const ai = oppBoard.active.indexOf(attacker);
            attacker.hp = Math.max(0, attacker.hp - 1);
            spawnDmgPopup(1, getSlotEl('opp-active-zone', ai));
            toast(`🗡 <b>${wtg.name} · 奪槊</b> — 反奪兵器，刺傷 ${attacker.name}！`, 'skill', 2500);
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
                oppAtk.hp = Math.max(0, oppAtk.hp - 1);
                spawnSkillFx('⚔', getSlotEl('opp-active-zone', oi));
                spawnDmgPopup(1, getSlotEl('opp-active-zone', oi));
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
                enemy.hp = Math.max(0, enemy.hp - 1);
                spawnSkillFx('🗡', getSlotEl('opp-active-zone', ei));
                spawnDmgPopup(1, getSlotEl('opp-active-zone', ei));
                toast(`⚔ <b>${targetCard.name} · 靖難</b> — 以攻代守，反擊 <b>${enemy.name}</b>！`, 'skill');
                _SFX.attack();
                renderOppBoard(); updateHUDs();
                if (checkWinCondition()) return;
            }
        }
    }

    // 火燒連營（陸遜，AI方）：玩家君主受傷時，追加 1 傷害給玩家隨機武將
    if (targetCard.type === '君王' && dmg > 0) {
        const luXun = [...oppBoard.active, ...oppBoard.bench].find(c => c && c.skillName === '火燒連營' && c.hp > 0);
        if (luXun) {
            const extras = [...myBoard.active, ...myBoard.bench].filter(u => u && u !== targetCard && u.hp > 0);
            if (extras.length > 0) {
                const exTgt = extras[Math.floor(Math.random() * extras.length)];
                const exZone = myBoard.active.indexOf(exTgt) !== -1 ? 'active' : 'bench';
                const exIdx  = exZone === 'active' ? myBoard.active.indexOf(exTgt) : myBoard.bench.indexOf(exTgt);
                exTgt.hp = Math.max(0, exTgt.hp - 1);
                spawnDmgPopup(1, getSlotEl(`my-${exZone}-zone`, exIdx));
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
                myBoard.active[2].hp = Math.max(0, myBoard.active[2].hp - 1);
                spawnDmgPopup(1, getSlotEl('my-active-zone', 2));
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
//  GLOBAL BINDINGS (供 HTML onclick 呼叫)
// ==============================================================
window.showGraveyard       = showGraveyard;
window.closeGraveyardModal = closeGraveyardModal;
window.toggleBattleLog     = toggleBattleLog;
window.applyHostState      = applyHostState;
