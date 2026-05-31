/* ============================================================
   華夏風雲錄 — network.js  v2

   Copyright © 2026 linus622wang@gmail.com
   All Rights Reserved.

   未經開發者 linus622wang@gmail.com 書面授權，
   嚴禁任何形式的複製、修改、散佈或商業使用。
   Unauthorized copying, modification, distribution,
   or commercial use of this file is strictly prohibited.
   PeerJS WebRTC P2P 連線封裝
   房間碼格式：5 位大寫英數字 (A-Z / 2-9，去除易混淆字符)
   PeerID 格式：hxf2026 + 房間碼 (避免與其他應用衝突)

   v2 優化：
   - 發送佇列（連線建立前的訊息自動暫存，開通後批次送出）
   - 心跳機制（每 5 秒 ping，8 秒無回應視為斷線）
   - 連線逾時（15 秒無法建立連線自動觸發 net_error）
   - 重複連線防護（主機只接受第一個客方）
   - 斷線自動重連（最多 2 次，指數退避）
   ============================================================ */
'use strict';

window.Network = (function () {
    const PREFIX          = 'hxf2026';
    const CONNECT_TIMEOUT = 15000;   // 等待建立連線的最長時間 (ms)
    const HEARTBEAT_INTERVAL = 5000; // 心跳間隔 (ms)
    const HEARTBEAT_TIMEOUT  = 8000; // 無 pong 回應多久後視為斷線 (ms)
    const MAX_RECONNECT      = 2;    // 最多嘗試重連次數

    let _peer          = null;
    let _conn          = null;
    const _handlers    = {};
    let _isHost        = false;
    let _roomCode      = '';

    // 發送佇列：連線未開通前暫存訊息
    let _sendQueue     = [];

    // 心跳
    let _hbInterval    = null;
    let _hbTimer       = null;   // 等待 pong 的計時器

    // 連線逾時
    let _connTimeout   = null;

    // 重連
    let _reconnectCount = 0;
    let _destroyed      = false;

    // ── 事件系統 ──────────────────────────────
    function on(event, callback) {
        _handlers[event] = callback;
    }

    function _emit(event, data) {
        if (typeof _handlers[event] === 'function') {
            try { _handlers[event](data); }
            catch (e) { console.error('[Network] Handler error:', event, e); }
        }
    }

    // ── 發送（帶佇列）────────────────────────
    function send(type, data) {
        if (type === '_ping' || type === '_pong') {
            // 心跳直接送，不進佇列
            _rawSend({ type, data });
            return;
        }
        if (_conn && _conn.open) {
            _rawSend({ type, data });
        } else {
            // 連線未開通，暫存至佇列
            _sendQueue.push({ type, data });
        }
    }

    function _rawSend(msg) {
        if (!_conn || !_conn.open) return;
        try { _conn.send(msg); }
        catch (e) { console.error('[Network] Send error:', e); }
    }

    function _flushQueue() {
        while (_sendQueue.length > 0 && _conn && _conn.open) {
            _rawSend(_sendQueue.shift());
        }
    }

    // ── 心跳 ─────────────────────────────────
    function _startHeartbeat() {
        _stopHeartbeat();
        _hbInterval = setInterval(() => {
            if (!_conn || !_conn.open) return;
            // H-8 Fix：先清除舊計時器，防止多個 timeout 堆疊
            if (_hbTimer) { clearTimeout(_hbTimer); _hbTimer = null; }
            _rawSend({ type: '_ping', data: Date.now() });
            _hbTimer = setTimeout(() => {
                console.warn('[Network] 心跳逾時，視為斷線');
                _handleDisconnect();
            }, HEARTBEAT_TIMEOUT);
        }, HEARTBEAT_INTERVAL);
    }

    function _stopHeartbeat() {
        if (_hbInterval) { clearInterval(_hbInterval); _hbInterval = null; }
        if (_hbTimer)    { clearTimeout(_hbTimer);     _hbTimer    = null; }
    }

    function _onPing(ts) {
        // 收到 ping，立刻回 pong
        _rawSend({ type: '_pong', data: ts });
    }

    function _onPong() {
        // 收到 pong，取消斷線計時器
        if (_hbTimer) { clearTimeout(_hbTimer); _hbTimer = null; }
    }

    // ── 工具 ─────────────────────────────────
    function _pid(code) { return PREFIX + code.toUpperCase(); }

    function randomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        // L-4 Fix：改用 CSPRNG 防止房間碼被枚舉
        const arr = new Uint8Array(5);
        crypto.getRandomValues(arr);
        let result = '';
        for (let i = 0; i < 5; i++) {
            result += chars[arr[i] % chars.length];
        }
        return result;
    }

    // ── 建立房間（主機）──────────────────────
    function createRoom(code) {
        _destroyed = false;
        _reconnectCount = 0;
        _isHost   = true;
        _roomCode = code;

        _peer = new Peer(_pid(code), { debug: 0 });

        _peer.on('open', () => {
            _emit('room_ready', { code });
        });

        _peer.on('connection', (conn) => {
            // 防止多個客方同時連入
            if (_conn && _conn.open) {
                console.warn('[Network] 已有連線，拒絕新連入');
                conn.close();
                return;
            }
            _conn = conn;
            _setupConn();
        });

        _peer.on('error', (err) => {
            if (_destroyed) return;
            _emit('net_error', { message: err.message, type: err.type });
        });
    }

    // ── 加入房間（客方）──────────────────────
    function joinRoom(code) {
        _destroyed = false;
        _isHost   = false;
        _roomCode = code;

        _doJoin(code);
    }

    function _doJoin(code) {
        const guestPeerId = PREFIX + randomCode() + 'g';
        _peer = new Peer(guestPeerId, { debug: 0 });

        // 連線逾時保護
        _connTimeout = setTimeout(() => {
            if (_destroyed) return;
            if (!(_conn && _conn.open)) {
                _emit('net_error', { message: '連線逾時，請確認房間碼並重試', type: 'timeout' });
                destroy();
            }
        }, CONNECT_TIMEOUT);

        _peer.on('open', () => {
            _conn = _peer.connect(_pid(code), {
                reliable: true,
                serialization: 'json'
            });
            _setupConn();
        });

        _peer.on('error', (err) => {
            if (_destroyed) return;
            _clearConnTimeout();
            _emit('net_error', { message: err.message, type: err.type });
        });
    }

    // ── 設置連線事件 ─────────────────────────
    function _setupConn() {
        _conn.on('open', () => {
            _clearConnTimeout();
            _reconnectCount = 0;
            _flushQueue();          // 送出暫存訊息
            _startHeartbeat();      // 啟動心跳
            _emit('peer_connected', { isHost: _isHost });
        });

        _conn.on('data', (msg) => {
            if (!msg || typeof msg !== 'object') return;
            try {
                // 心跳訊息不轉發給遊戲層
                if (msg.type === '_ping') { _onPing(msg.data); return; }
                if (msg.type === '_pong') { _onPong();         return; }
                _emit(msg.type, msg.data);
            } catch (e) {
                console.error('[Network] Data handler error:', e);
            }
        });

        _conn.on('close', () => {
            if (_destroyed) return;
            _handleDisconnect();
        });

        _conn.on('error', (err) => {
            if (_destroyed) return;
            console.error('[Network] Connection error:', err);
            _handleDisconnect();
        });
    }

    // ── 斷線處理（含重連）────────────────────
    function _handleDisconnect() {
        _stopHeartbeat();

        // 客方嘗試重連
        if (!_isHost && _reconnectCount < MAX_RECONNECT) {
            _reconnectCount++;
            const delay = _reconnectCount * 1500; // 1.5s, 3s
            console.warn(`[Network] 斷線，${delay}ms 後嘗試重連 (${_reconnectCount}/${MAX_RECONNECT})`);
            _emit('reconnecting', { attempt: _reconnectCount, max: MAX_RECONNECT });

            setTimeout(() => {
                if (_destroyed) return;
                try { if (_peer) _peer.destroy(); } catch (_) {}
                _peer = null;
                _conn = null;
                _doJoin(_roomCode);
            }, delay);
            return;
        }

        // 重連失敗或主機端 → 通知遊戲層
        _emit('peer_disconnected', {});
    }

    // ── 清理逾時計時器 ────────────────────────
    function _clearConnTimeout() {
        if (_connTimeout) { clearTimeout(_connTimeout); _connTimeout = null; }
    }

    // ── 銷毀並清理 ────────────────────────────
    function destroy() {
        _destroyed = true;
        _stopHeartbeat();
        _clearConnTimeout();
        _sendQueue = [];
        _reconnectCount = 0;
        try { if (_conn)  _conn.close();    } catch (_) {}
        try { if (_peer)  _peer.destroy();  } catch (_) {}
        _conn = null;
        _peer = null;
    }

    // ── 公開介面 ─────────────────────────────
    return {
        on,
        send,
        createRoom,
        joinRoom,
        destroy,
        randomCode,
        get roomCode()  { return _roomCode; },
        get isHost()    { return _isHost; },
        get connected() { return !!(_conn && _conn.open); }
    };
})();
