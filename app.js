// ============================================
// DUNO — Multiplayer Card Game Application
// ============================================
// Complete game logic, Firebase sync, and UI
// ============================================

(function () {
    'use strict';

    // ==========================================
    // CONSTANTS & STATE
    // ==========================================

    const COLORS = ['red', 'blue', 'green', 'yellow'];
    const AVATAR_COLORS = ['#e84545', '#4285f4', '#34a853', '#f5c518'];
    const ACTION_CARDS = ['skip', 'reverse', 'draw2'];
    const SYMBOLS = {
        skip: '⊘',
        reverse: '⟳',
        draw2: '+2',
        wild: '★',
        wild4: '+4'
    };

    // App-wide state
    let state = {
        playerId: null,
        playerName: '',
        roomId: null,
        isHost: false,
        roomRef: null,
        roomListener: null,
        gameData: null,
        pendingWildCard: null,   // card waiting for color choice
        hasDrawnThisTurn: false, // track if player drew this turn
        drawnCardIndex: -1,      // index of drawn card for immediate play
        calledDuno: false,
        dunoTimeout: null,
        turnTimer: null,        // interval for countdown
        turnTimeLeft: 0,        // seconds remaining
        lastTurnPlayer: null    // track turn changes
    };

    const TURN_TIME_LIMIT = 30; // seconds per turn
    const TIMER_CIRCUMFERENCE = 2 * Math.PI * 16; // ~100.53 for r=16

    // ==========================================
    // UTILITY FUNCTIONS
    // ==========================================

    /** Generate a random 6-character room code */
    function generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
        return code;
    }

    /** Generate a unique player ID */
    function generatePlayerId() {
        return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    }

    /** Fisher-Yates shuffle */
    function shuffleDeck(deck) {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    /** Show a toast notification */
    function showToast(message, duration = 2000) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.remove('hidden');
        clearTimeout(toast._timeout);
        toast._timeout = setTimeout(() => {
            toast.classList.add('hidden');
        }, duration);
    }

    /** Switch to a screen */
    function showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    }

    /** Show/hide modal */
    function showModal(modalId) {
        document.getElementById(modalId).classList.remove('hidden');
    }
    function hideModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
    }

    // ==========================================
    // SOUND EFFECTS (Web Audio API)
    // ==========================================

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    let audioCtx = null;

    function ensureAudio() {
        if (!audioCtx) audioCtx = new AudioCtx();
    }

    function playTone(freq, duration, type = 'sine', volume = 0.15) {
        try {
            ensureAudio();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            gain.gain.value = volume;
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch (e) { /* audio not supported */ }
    }

    const SFX = {
        cardPlay: () => { playTone(523, 0.12, 'sine'); setTimeout(() => playTone(659, 0.1, 'sine'), 60); },
        cardDraw: () => playTone(330, 0.15, 'triangle'),
        skip: () => { playTone(440, 0.1, 'square', 0.08); setTimeout(() => playTone(330, 0.15, 'square', 0.08), 100); },
        reverse: () => { playTone(440, 0.08, 'sine'); setTimeout(() => playTone(523, 0.08, 'sine'), 80); setTimeout(() => playTone(440, 0.12, 'sine'), 160); },
        wild: () => { [523, 587, 659, 784].forEach((f, i) => setTimeout(() => playTone(f, 0.1, 'sine'), i * 60)); },
        duno: () => { playTone(784, 0.15, 'square', 0.1); setTimeout(() => playTone(988, 0.2, 'square', 0.1), 120); },
        win: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.25, 'sine', 0.12), i * 150)); },
        error: () => playTone(200, 0.2, 'sawtooth', 0.06),
        join: () => playTone(659, 0.15, 'sine', 0.1)
    };

    // ==========================================
    // DECK GENERATION
    // ==========================================

    /** Generate the full 108-card deck */
    function generateDeck() {
        const deck = [];

        for (const color of COLORS) {
            // One 0 per color
            deck.push({ color, type: 'number', value: 0 });

            // Two each of 1–9
            for (let n = 1; n <= 9; n++) {
                deck.push({ color, type: 'number', value: n });
                deck.push({ color, type: 'number', value: n });
            }

            // Two each of action cards
            for (const action of ACTION_CARDS) {
                deck.push({ color, type: 'action', value: action });
                deck.push({ color, type: 'action', value: action });
            }
        }

        // 4 Wilds and 4 Wild Draw Fours
        for (let i = 0; i < 4; i++) {
            deck.push({ color: 'wild', type: 'wild', value: 'wild' });
            deck.push({ color: 'wild', type: 'wild', value: 'wild4' });
        }

        return deck; // 108 cards total
    }

    // ==========================================
    // CARD RENDERING
    // ==========================================

    /** Create a card DOM element */
    function createCardElement(card, isPlayable = false) {
        const el = document.createElement('div');
        el.className = 'card';

        // Add color class
        if (card.color === 'wild') {
            el.classList.add('card-wild');
        } else {
            el.classList.add('card-' + card.color);
        }

        if (isPlayable) el.classList.add('playable');

        // Card content
        let displayValue = '';
        let displayLabel = '';

        if (card.type === 'number') {
            displayValue = card.value.toString();
        } else if (card.type === 'action') {
            displayValue = SYMBOLS[card.value] || card.value;
            displayLabel = card.value === 'draw2' ? 'DRAW' : card.value.toUpperCase();
        } else if (card.type === 'wild') {
            displayValue = SYMBOLS[card.value] || '★';
            displayLabel = card.value === 'wild4' ? 'WILD +4' : 'WILD';
        }

        el.innerHTML = `
      <span class="card-corner top-left">${displayValue}</span>
      <span class="card-value">${displayValue}</span>
      ${displayLabel ? `<span class="card-label">${displayLabel}</span>` : ''}
      <span class="card-corner bottom-right">${displayValue}</span>
    `;

        return el;
    }

    // ==========================================
    // GAME LOGIC
    // ==========================================

    /** Check if a card can be played on the current discard */
    function isPlayable(card, topCard, currentColor) {
        // Wild cards are always playable
        if (card.type === 'wild') return true;

        // Match current color (important for after wild play)
        if (card.color === currentColor) return true;

        // Match number
        if (card.type === 'number' && topCard.type === 'number' && card.value === topCard.value) return true;

        // Match action
        if (card.type === 'action' && topCard.type === 'action' && card.value === topCard.value) return true;

        return false;
    }

    /** Get the next player index given direction and optional skip count */
    function getNextPlayerIndex(playerOrder, currentIndex, direction, skip = 1) {
        const len = playerOrder.length;
        return ((currentIndex + direction * skip) % len + len) % len;
    }

    /** Find a valid first discard card (not a wild card) */
    function findFirstDiscard(deck) {
        for (let i = 0; i < deck.length; i++) {
            if (deck[i].type === 'number') {
                return deck.splice(i, 1)[0];
            }
        }
        // Fallback: just use first card
        return deck.shift();
    }

    // ==========================================
    // ROOM SYSTEM
    // ==========================================

    /** Create a new game room */
    async function createRoom() {
        const name = document.getElementById('player-name').value.trim();
        if (!name) {
            showToast('Please enter your name');
            return;
        }

        state.playerName = name;
        state.playerId = generatePlayerId();
        state.roomId = generateRoomCode();
        state.isHost = true;

        // Save for rejoin
        localStorage.setItem('duno_playerId', state.playerId);
        localStorage.setItem('duno_roomId', state.roomId);
        localStorage.setItem('duno_playerName', state.playerName);

        const roomData = {
            host: state.playerId,
            gameState: 'waiting',
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            players: {
                [state.playerId]: {
                    name: name,
                    hand: [],
                    calledDuno: false,
                    connected: true
                }
            }
        };

        try {
            await db.ref('rooms/' + state.roomId).set(roomData);

            // Set up disconnect handler
            db.ref('rooms/' + state.roomId + '/players/' + state.playerId + '/connected')
                .onDisconnect().set(false);

            showScreen('screen-lobby');
            listenToRoom();
            SFX.join();
        } catch (error) {
            showToast('Failed to create room. Check Firebase config.');
            console.error(error);
        }
    }

    /** Join an existing room */
    async function joinRoom() {
        const name = document.getElementById('player-name').value.trim();
        const code = document.getElementById('room-code-input').value.trim().toUpperCase();

        if (!name) { showToast('Please enter your name'); return; }
        if (!code || code.length !== 6) { showToast('Enter a valid 6-digit room code'); return; }

        state.playerName = name;
        state.roomId = code;

        try {
            const snapshot = await db.ref('rooms/' + code).once('value');
            if (!snapshot.exists()) {
                showToast('Room not found');
                return;
            }

            const roomData = snapshot.val();

            if (roomData.gameState !== 'waiting') {
                // Check for rejoin
                const savedId = localStorage.getItem('duno_playerId');
                if (savedId && roomData.players && roomData.players[savedId]) {
                    state.playerId = savedId;
                    state.isHost = roomData.host === savedId;

                    // Mark as reconnected
                    await db.ref('rooms/' + code + '/players/' + savedId + '/connected').set(true);

                    localStorage.setItem('duno_roomId', state.roomId);
                    localStorage.setItem('duno_playerName', state.playerName);

                    showScreen(roomData.gameState === 'playing' ? 'screen-game' : 'screen-lobby');
                    listenToRoom();
                    showToast('Rejoined the game!');
                    SFX.join();
                    return;
                }
                showToast('Game already in progress');
                return;
            }

            const playerCount = roomData.players ? Object.keys(roomData.players).length : 0;
            if (playerCount >= 4) {
                showToast('Room is full (max 4 players)');
                return;
            }

            state.playerId = generatePlayerId();
            state.isHost = false;

            localStorage.setItem('duno_playerId', state.playerId);
            localStorage.setItem('duno_roomId', state.roomId);
            localStorage.setItem('duno_playerName', state.playerName);

            await db.ref('rooms/' + code + '/players/' + state.playerId).set({
                name: name,
                hand: [],
                calledDuno: false,
                connected: true
            });

            db.ref('rooms/' + code + '/players/' + state.playerId + '/connected')
                .onDisconnect().set(false);

            showScreen('screen-lobby');
            listenToRoom();
            SFX.join();
        } catch (error) {
            showToast('Failed to join room');
            console.error(error);
        }
    }

    /** Leave the current room */
    async function leaveRoom() {
        if (state.roomRef && state.roomListener) {
            state.roomRef.off('value', state.roomListener);
        }

        if (state.roomId && state.playerId) {
            try {
                await db.ref('rooms/' + state.roomId + '/players/' + state.playerId).remove();

                // If host leaves and game is waiting, clean up room
                if (state.isHost) {
                    const snap = await db.ref('rooms/' + state.roomId + '/players').once('value');
                    if (!snap.exists() || Object.keys(snap.val() || {}).length === 0) {
                        await db.ref('rooms/' + state.roomId).remove();
                    }
                }
            } catch (e) { console.error(e); }
        }

        localStorage.removeItem('duno_roomId');
        resetState();
        showScreen('screen-welcome');
    }

    /** Reset local state */
    function resetState() {
        state.roomId = null;
        state.isHost = false;
        state.roomRef = null;
        state.roomListener = null;
        state.gameData = null;
        state.pendingWildCard = null;
        state.hasDrawnThisTurn = false;
        state.drawnCardIndex = -1;
        state.calledDuno = false;
        stopTurnTimer();
        state.lastTurnPlayer = null;
    }

    // ==========================================
    // FIREBASE LISTENERS
    // ==========================================

    /** Listen to room data changes */
    function listenToRoom() {
        state.roomRef = db.ref('rooms/' + state.roomId);
        state.roomListener = state.roomRef.on('value', (snapshot) => {
            if (!snapshot.exists()) {
                showToast('Room was closed');
                resetState();
                showScreen('screen-welcome');
                return;
            }

            const data = snapshot.val();
            const prevState = state.gameData?.gameState;
            state.gameData = data;
            state.isHost = data.host === state.playerId;

            if (data.gameState === 'waiting') {
                renderLobby(data);
            } else if (data.gameState === 'playing') {
                if (prevState === 'waiting') {
                    showScreen('screen-game');
                    SFX.cardPlay();
                }
                renderGame(data);
            } else if (data.gameState === 'finished') {
                renderGame(data);
                showGameOver(data);
            }
        });
    }

    // ==========================================
    // LOBBY RENDERING
    // ==========================================

    function renderLobby(data) {
        document.getElementById('lobby-room-code').textContent = state.roomId;

        const players = data.players || {};
        const playerIds = Object.keys(players);
        const count = playerIds.length;

        document.getElementById('player-count').textContent = `(${count}/4)`;

        const list = document.getElementById('player-list');
        list.innerHTML = '';

        playerIds.forEach((id, i) => {
            const p = players[id];
            const li = document.createElement('li');
            li.innerHTML = `
        <div class="player-avatar" style="background:${AVATAR_COLORS[i % 4]}">${p.name[0].toUpperCase()}</div>
        <span>${p.name}</span>
        ${id === data.host ? '<span class="host-badge">Host</span>' : ''}
        ${!p.connected ? '<span style="color:var(--clr-text-dim);margin-left:auto;font-size:0.7rem">offline</span>' : ''}
      `;
            list.appendChild(li);
        });

        // Show/hide start button
        const startBtn = document.getElementById('btn-start-game');
        const statusEl = document.getElementById('lobby-status');

        if (state.isHost) {
            if (count >= 2) {
                startBtn.classList.remove('hidden');
                startBtn.disabled = false;
                statusEl.textContent = 'Ready to start!';
            } else {
                startBtn.classList.add('hidden');
                statusEl.textContent = 'Need at least 2 players...';
            }
        } else {
            startBtn.classList.add('hidden');
            statusEl.textContent = 'Waiting for host to start...';
        }
    }

    // ==========================================
    // START GAME
    // ==========================================

    async function startGame() {
        if (!state.isHost) return;

        const snap = await db.ref('rooms/' + state.roomId + '/players').once('value');
        const players = snap.val();
        if (!players) return;

        const playerIds = Object.keys(players);
        if (playerIds.length < 2) {
            showToast('Need at least 2 players');
            return;
        }

        // Generate and shuffle deck
        let deck = generateDeck();
        shuffleDeck(deck);

        // Deal 7 cards to each player
        const hands = {};
        for (const pid of playerIds) {
            hands[pid] = deck.splice(0, 7);
        }

        // Find first discard card (must be a number card)
        const firstDiscard = findFirstDiscard(deck);

        // Create player order (randomized)
        const playerOrder = [...playerIds];
        shuffleDeck(playerOrder);

        // Build game state update
        const updates = {};
        updates['gameState'] = 'playing';
        updates['deck'] = deck;
        updates['discardPile'] = [firstDiscard];
        updates['currentTurn'] = playerOrder[0];
        updates['direction'] = 1;
        updates['currentColor'] = firstDiscard.color;
        updates['playerOrder'] = playerOrder;
        updates['turnTimestamp'] = firebase.database.ServerValue.TIMESTAMP;

        // Update each player's hand
        for (const pid of playerIds) {
            updates['players/' + pid + '/hand'] = hands[pid];
            updates['players/' + pid + '/calledDuno'] = false;
        }

        try {
            await db.ref('rooms/' + state.roomId).update(updates);
        } catch (error) {
            showToast('Failed to start game');
            console.error(error);
        }
    }

    // ==========================================
    // TURN TIMER
    // ==========================================

    /** Start the turn timer countdown */
    function startTurnTimer(isMyTurn) {
        stopTurnTimer();
        state.turnTimeLeft = TURN_TIME_LIMIT;
        updateTimerDisplay();

        state.turnTimer = setInterval(() => {
            state.turnTimeLeft--;
            updateTimerDisplay();

            if (state.turnTimeLeft <= 0) {
                stopTurnTimer();
                // If it's my turn and time ran out, auto-draw and skip
                if (isMyTurn && state.gameData?.gameState === 'playing') {
                    showToast('Time\'s up! Auto-drawing...');
                    SFX.error();
                    drawCard();
                }
            }
        }, 1000);
    }

    /** Stop the turn timer */
    function stopTurnTimer() {
        if (state.turnTimer) {
            clearInterval(state.turnTimer);
            state.turnTimer = null;
        }
    }

    /** Update the timer visual (ring + text) */
    function updateTimerDisplay() {
        const textEl = document.getElementById('timer-text');
        const ringEl = document.getElementById('timer-ring-progress');
        if (!textEl || !ringEl) return;

        const t = Math.max(0, state.turnTimeLeft);
        textEl.textContent = t;

        // Calculate ring dash offset (full = 0, empty = circumference)
        const progress = t / TURN_TIME_LIMIT;
        const offset = TIMER_CIRCUMFERENCE * (1 - progress);
        ringEl.style.strokeDashoffset = offset;

        // Urgent styling when <= 10 seconds
        const isUrgent = t <= 10;
        textEl.className = 'timer-text' + (isUrgent ? ' urgent' : '');
        ringEl.className.baseVal = 'timer-ring-progress' + (isUrgent ? ' urgent' : '');
    }

    // ==========================================
    // GAME RENDERING
    // ==========================================

    function renderGame(data) {
        if (!data || !data.players || !data.playerOrder) return;

        const myTurn = data.currentTurn === state.playerId;
        const myHand = data.players[state.playerId]?.hand || [];
        const topCard = data.discardPile ? data.discardPile[data.discardPile.length - 1] : null;
        const currentColor = data.currentColor || (topCard ? topCard.color : 'red');

        // --- Turn timer ---
        if (data.currentTurn !== state.lastTurnPlayer) {
            state.lastTurnPlayer = data.currentTurn;
            startTurnTimer(myTurn);
        }

        // --- Status text ---
        const statusEl = document.getElementById('game-status-text');
        if (data.gameState === 'finished') {
            statusEl.textContent = 'Game Over!';
            statusEl.className = 'game-status-text';
            stopTurnTimer();
        } else if (myTurn) {
            statusEl.textContent = 'Your turn!';
            statusEl.className = 'game-status-text your-turn';
        } else {
            const currentPlayer = data.players[data.currentTurn];
            statusEl.textContent = currentPlayer ? `${currentPlayer.name}'s turn` : 'Waiting...';
            statusEl.className = 'game-status-text';
        }

        // --- Opponents bar ---
        renderOpponents(data);

        // --- Discard pile ---
        renderDiscardPile(topCard, currentColor);

        // --- Deck count ---
        const deckCount = data.deck ? data.deck.length : 0;
        document.getElementById('deck-count').textContent = deckCount;

        // --- Direction ---
        const arrow = document.querySelector('.direction-arrow');
        if (data.direction === -1) {
            arrow.classList.add('reverse');
            arrow.textContent = '↺';
        } else {
            arrow.classList.remove('reverse');
            arrow.textContent = '↻';
        }

        // --- Player hand ---
        renderPlayerHand(myHand, topCard, currentColor, myTurn);

        // --- Draw button ---
        const drawBtn = document.getElementById('btn-draw');
        drawBtn.disabled = !myTurn || state.hasDrawnThisTurn;

        // --- Stop Game button (host only) ---
        const stopBtn = document.getElementById('btn-stop-game');
        if (state.isHost && data.gameState === 'playing') {
            stopBtn.classList.remove('hidden');
        } else {
            stopBtn.classList.add('hidden');
        }

        // --- DUNO button ---
        const dunoBtn = document.getElementById('btn-duno');
        if (myHand.length === 1 && !data.players[state.playerId]?.calledDuno && myTurn) {
            dunoBtn.classList.remove('hidden');
        } else {
            dunoBtn.classList.add('hidden');
        }
    }

    function renderOpponents(data) {
        const bar = document.getElementById('opponents-bar');
        bar.innerHTML = '';

        for (const pid of data.playerOrder) {
            if (pid === state.playerId) continue;

            const p = data.players[pid];
            if (!p) continue;

            const cardCount = p.hand ? p.hand.length : 0;
            const isTurn = data.currentTurn === pid;
            const idx = data.playerOrder.indexOf(pid);

            const div = document.createElement('div');
            div.className = 'opponent-card' + (isTurn ? ' is-turn' : '');
            div.innerHTML = `
        <div class="opponent-avatar" style="background:${AVATAR_COLORS[idx % 4]}">${p.name[0].toUpperCase()}</div>
        <div class="opponent-info">
          <span class="opponent-name">${p.name}</span>
          <span class="opponent-cards">🃏 ${cardCount} card${cardCount !== 1 ? 's' : ''}</span>
          ${cardCount === 1 && p.calledDuno ? '<span class="opponent-duno">DUNO!</span>' : ''}
          ${!p.connected ? '<span style="color:var(--clr-text-dim);font-size:0.6rem">offline</span>' : ''}
        </div>
      `;
            bar.appendChild(div);
        }
    }

    function renderDiscardPile(topCard, currentColor) {
        const pile = document.getElementById('discard-pile');
        if (!topCard) {
            pile.innerHTML = '<div class="card card-wild"><span class="card-value">?</span></div>';
            return;
        }

        const el = createCardElement(topCard);
        el.classList.remove('playable');
        el.style.cursor = 'default';
        el.style.opacity = '1';

        // Add color indicator for wild cards
        if (topCard.type === 'wild' && currentColor !== 'wild') {
            const indicator = document.createElement('div');
            indicator.className = 'color-indicator ci-' + currentColor;
            el.appendChild(indicator);
        }

        pile.innerHTML = '';
        pile.appendChild(el);
    }

    function renderPlayerHand(hand, topCard, currentColor, myTurn) {
        const container = document.getElementById('player-hand');
        container.innerHTML = '';

        hand.forEach((card, index) => {
            const playable = myTurn && topCard && isPlayable(card, topCard, currentColor);

            // If player has drawn a card, only the drawn card is playable for immediate play
            const isDrawnCard = state.hasDrawnThisTurn && index === state.drawnCardIndex;
            const canPlay = state.hasDrawnThisTurn ? (isDrawnCard && playable) : playable;

            const el = createCardElement(card, canPlay);

            if (isDrawnCard) {
                el.classList.add('just-drawn');
            }

            if (canPlay) {
                el.addEventListener('click', () => playCard(index));
            }

            container.appendChild(el);
        });
    }

    // ==========================================
    // PLAY CARD
    // ==========================================

    async function playCard(cardIndex) {
        const data = state.gameData;
        if (!data || data.currentTurn !== state.playerId || data.gameState !== 'playing') return;

        const myHand = [...(data.players[state.playerId]?.hand || [])];
        if (cardIndex < 0 || cardIndex >= myHand.length) return;

        const card = myHand[cardIndex];
        const topCard = data.discardPile[data.discardPile.length - 1];
        const currentColor = data.currentColor;

        if (!isPlayable(card, topCard, currentColor)) {
            showToast('Can\'t play that card');
            SFX.error();
            return;
        }

        // Wild card? Show color picker first
        if (card.type === 'wild') {
            state.pendingWildCard = { card, cardIndex };
            showModal('modal-color-picker');
            SFX.wild();
            return;
        }

        // Play the card
        await executePlay(card, cardIndex, card.color);
    }

    /** Execute a card play with given color (used for normal + wild) */
    async function executePlay(card, cardIndex, chosenColor) {
        const data = state.gameData;
        const myHand = [...(data.players[state.playerId]?.hand || [])];
        const deck = data.deck ? [...data.deck] : [];
        let discardPile = data.discardPile ? [...data.discardPile] : [];
        const playerOrder = data.playerOrder;
        let direction = data.direction || 1;

        // Remove card from hand
        myHand.splice(cardIndex, 1);

        // Add to discard pile
        discardPile.push(card);

        const currentIndex = playerOrder.indexOf(state.playerId);
        let nextTurnIndex;
        const updates = {};

        // Apply card effects
        if (card.type === 'action') {
            switch (card.value) {
                case 'skip':
                    // Skip next player
                    nextTurnIndex = getNextPlayerIndex(playerOrder, currentIndex, direction, 2);
                    SFX.skip();
                    showToast('Skip! ⊘');
                    break;

                case 'reverse':
                    // Reverse direction
                    direction *= -1;
                    updates['direction'] = direction;
                    if (playerOrder.length === 2) {
                        // In 2-player, reverse acts like skip
                        nextTurnIndex = currentIndex; // stays on same player? No, skip
                        nextTurnIndex = getNextPlayerIndex(playerOrder, currentIndex, direction, 2);
                    } else {
                        nextTurnIndex = getNextPlayerIndex(playerOrder, currentIndex, direction, 1);
                    }
                    SFX.reverse();
                    showToast('Reverse! ⟳');
                    break;

                case 'draw2':
                    // Next player draws 2 and loses turn
                    const draw2TargetIndex = getNextPlayerIndex(playerOrder, currentIndex, direction, 1);
                    const draw2TargetId = playerOrder[draw2TargetIndex];
                    const draw2Hand = [...(data.players[draw2TargetId]?.hand || [])];

                    // Draw 2 cards
                    for (let i = 0; i < 2; i++) {
                        if (deck.length === 0) reshuffleFromDiscard(deck, discardPile);
                        if (deck.length > 0) draw2Hand.push(deck.shift());
                    }

                    updates['players/' + draw2TargetId + '/hand'] = draw2Hand;
                    updates['deck'] = deck;

                    // Skip that player
                    nextTurnIndex = getNextPlayerIndex(playerOrder, currentIndex, direction, 2);
                    SFX.skip();
                    showToast(`${data.players[draw2TargetId].name} draws 2! +2`);
                    break;
            }
        } else if (card.type === 'wild' && card.value === 'wild4') {
            // Wild Draw Four: next player draws 4 and loses turn
            const draw4TargetIndex = getNextPlayerIndex(playerOrder, currentIndex, direction, 1);
            const draw4TargetId = playerOrder[draw4TargetIndex];
            const draw4Hand = [...(data.players[draw4TargetId]?.hand || [])];

            for (let i = 0; i < 4; i++) {
                if (deck.length === 0) reshuffleFromDiscard(deck, discardPile);
                if (deck.length > 0) draw4Hand.push(deck.shift());
            }

            updates['players/' + draw4TargetId + '/hand'] = draw4Hand;
            updates['deck'] = deck;

            nextTurnIndex = getNextPlayerIndex(playerOrder, currentIndex, direction, 2);
            SFX.skip();
            showToast(`${data.players[draw4TargetId].name} draws 4! +4`);
        } else {
            // Regular card or regular Wild
            nextTurnIndex = getNextPlayerIndex(playerOrder, currentIndex, direction, 1);
            SFX.cardPlay();
        }

        // Update game state
        updates['players/' + state.playerId + '/hand'] = myHand;
        updates['discardPile'] = discardPile;
        updates['currentColor'] = chosenColor;
        updates['currentTurn'] = playerOrder[nextTurnIndex];
        updates['turnTimestamp'] = firebase.database.ServerValue.TIMESTAMP;

        if (!updates['deck']) {
            updates['deck'] = deck;
        }

        // Check win condition
        if (myHand.length === 0) {
            updates['gameState'] = 'finished';
            updates['winner'] = state.playerId;
            SFX.win();
        }

        // Reset draw state
        state.hasDrawnThisTurn = false;
        state.drawnCardIndex = -1;

        // DUNO check: if player now has 1 card and hasn't called DUNO, penalty applied later
        if (myHand.length === 1) {
            state.calledDuno = false;
            // Start timer — if they don't call DUNO within 3 seconds, auto penalty
            clearTimeout(state.dunoTimeout);
            state.dunoTimeout = setTimeout(() => {
                enforceDunoPenalty();
            }, 5000);
        }

        try {
            await db.ref('rooms/' + state.roomId).update(updates);
        } catch (error) {
            showToast('Failed to play card');
            console.error(error);
        }
    }

    /** Reshuffle discard pile back into deck */
    function reshuffleFromDiscard(deck, discardPile) {
        if (discardPile.length <= 1) return;
        const topCard = discardPile.pop();
        // Move all but top to deck
        while (discardPile.length > 0) {
            deck.push(discardPile.shift());
        }
        discardPile.push(topCard);
        shuffleDeck(deck);
    }

    // ==========================================
    // DRAW CARD
    // ==========================================

    async function drawCard() {
        const data = state.gameData;
        if (!data || data.currentTurn !== state.playerId || data.gameState !== 'playing') return;
        if (state.hasDrawnThisTurn) return;

        let deck = data.deck ? [...data.deck] : [];
        let discardPile = data.discardPile ? [...data.discardPile] : [];
        const myHand = [...(data.players[state.playerId]?.hand || [])];

        // Reshuffle if deck is empty
        if (deck.length === 0) {
            reshuffleFromDiscard(deck, discardPile);
        }

        if (deck.length === 0) {
            showToast('No cards left to draw!');
            return;
        }

        const drawnCard = deck.shift();
        myHand.push(drawnCard);

        const topCard = discardPile[discardPile.length - 1];
        const currentColor = data.currentColor;
        const canPlayDrawn = isPlayable(drawnCard, topCard, currentColor);

        const updates = {
            ['players/' + state.playerId + '/hand']: myHand,
            deck: deck,
            discardPile: discardPile
        };

        if (!canPlayDrawn) {
            // Can't play drawn card — pass turn
            const playerOrder = data.playerOrder;
            const currentIndex = playerOrder.indexOf(state.playerId);
            const direction = data.direction || 1;
            const nextIndex = getNextPlayerIndex(playerOrder, currentIndex, direction, 1);
            updates['currentTurn'] = playerOrder[nextIndex];
            updates['turnTimestamp'] = firebase.database.ServerValue.TIMESTAMP;
            state.hasDrawnThisTurn = false;
            SFX.cardDraw();
            showToast('Drew a card — no match, passing turn');
        } else {
            // Can play drawn card — keep turn, mark as drawn
            state.hasDrawnThisTurn = true;
            state.drawnCardIndex = myHand.length - 1;
            SFX.cardDraw();
            showToast('Drew a card — you can play it!');
        }

        try {
            await db.ref('rooms/' + state.roomId).update(updates);
        } catch (error) {
            showToast('Failed to draw card');
            console.error(error);
        }
    }

    // ==========================================
    // DUNO CALL & PENALTY
    // ==========================================

    async function callDuno() {
        state.calledDuno = true;
        clearTimeout(state.dunoTimeout);
        SFX.duno();
        showToast('DUNO!!!');

        try {
            await db.ref('rooms/' + state.roomId + '/players/' + state.playerId + '/calledDuno').set(true);
        } catch (e) { console.error(e); }
    }

    async function enforceDunoPenalty() {
        if (state.calledDuno) return;

        const data = state.gameData;
        if (!data || !data.players[state.playerId]) return;

        const myHand = [...(data.players[state.playerId]?.hand || [])];
        if (myHand.length !== 1) return;

        let deck = data.deck ? [...data.deck] : [];
        let discardPile = data.discardPile ? [...data.discardPile] : [];

        // Penalty: draw 2 cards
        for (let i = 0; i < 2; i++) {
            if (deck.length === 0) reshuffleFromDiscard(deck, discardPile);
            if (deck.length > 0) myHand.push(deck.shift());
        }

        showToast('Forgot to call DUNO! +2 penalty');
        SFX.error();

        try {
            await db.ref('rooms/' + state.roomId).update({
                ['players/' + state.playerId + '/hand']: myHand,
                deck: deck,
                discardPile: discardPile
            });
        } catch (e) { console.error(e); }
    }

    // ==========================================
    // COLOR PICKER
    // ==========================================

    function handleColorChoice(color) {
        hideModal('modal-color-picker');
        if (!state.pendingWildCard) return;

        const { card, cardIndex } = state.pendingWildCard;
        state.pendingWildCard = null;

        executePlay(card, cardIndex, color);
    }

    // ==========================================
    // GAME OVER
    // ==========================================

    function showGameOver(data) {
        const winnerId = data.winner;
        const winnerName = data.players[winnerId]?.name || 'Unknown';
        const isMe = winnerId === state.playerId;

        document.getElementById('winner-text').textContent = isMe ? 'You Win! 🎉' : `${winnerName} Wins!`;
        showModal('modal-game-over');

        if (isMe) SFX.win();
    }

    async function playAgain() {
        hideModal('modal-game-over');
        if (!state.isHost) {
            showToast('Waiting for host to restart...');
            return;
        }

        // Reset game to lobby state
        const data = state.gameData;
        if (!data) return;

        const updates = {
            gameState: 'waiting',
            deck: null,
            discardPile: null,
            currentTurn: null,
            direction: 1,
            currentColor: null,
            playerOrder: null,
            winner: null,
            turnTimestamp: null
        };

        // Reset all player hands
        const players = data.players || {};
        for (const pid of Object.keys(players)) {
            updates['players/' + pid + '/hand'] = [];
            updates['players/' + pid + '/calledDuno'] = false;
        }

        try {
            await db.ref('rooms/' + state.roomId).update(updates);
            showScreen('screen-lobby');
        } catch (e) {
            showToast('Failed to restart');
            console.error(e);
        }
    }

    function goHome() {
        hideModal('modal-game-over');
        leaveRoom();
    }

    // ==========================================
    // STOP GAME & ELIMINATE PLAYER
    // ==========================================

    /** Host stops the game — ends for everyone, returns to lobby */
    async function stopGame() {
        if (!state.isHost) return;
        if (!confirm('Stop and leave the game? You will be eliminated.')) return;

        await eliminatePlayer(state.playerId);
        leaveRoom();
    }

    /** Eliminate a player from the active game */
    async function eliminatePlayer(playerId) {
        const data = state.gameData;
        if (!data || data.gameState !== 'playing') return;

        const playerOrder = [...data.playerOrder];
        const eliminatedIndex = playerOrder.indexOf(playerId);
        if (eliminatedIndex === -1) return;

        // Put their cards back into the deck
        let deck = data.deck ? [...data.deck] : [];
        const eliminatedHand = data.players[playerId]?.hand || [];
        deck = deck.concat(eliminatedHand);
        shuffleDeck(deck);

        // Remove from player order
        playerOrder.splice(eliminatedIndex, 1);

        const updates = {
            deck: deck,
            playerOrder: playerOrder,
            ['players/' + playerId + '/hand']: [],
            ['players/' + playerId + '/eliminated']: true
        };

        // If only 1 player left, they win
        if (playerOrder.length <= 1) {
            updates['gameState'] = 'finished';
            updates['winner'] = playerOrder[0] || null;
            SFX.win();
        } else {
            // Advance turn if it was the eliminated player's turn
            if (data.currentTurn === playerId) {
                const direction = data.direction || 1;
                // Next player after the eliminated position
                const nextIndex = ((eliminatedIndex * direction) % playerOrder.length + playerOrder.length) % playerOrder.length;
                updates['currentTurn'] = playerOrder[nextIndex >= playerOrder.length ? 0 : nextIndex];
                updates['turnTimestamp'] = firebase.database.ServerValue.TIMESTAMP;
            }
        }

        const eliminatedName = data.players[playerId]?.name || 'A player';

        try {
            await db.ref('rooms/' + state.roomId).update(updates);
            showToast(`${playerId === state.playerId ? 'You were' : eliminatedName + ' was'} eliminated!`);
        } catch (e) {
            console.error('Failed to eliminate player:', e);
        }
    }

    // ==========================================
    // REJOIN SUPPORT
    // ==========================================

    async function attemptRejoin() {
        const savedRoomId = localStorage.getItem('duno_roomId');
        const savedPlayerId = localStorage.getItem('duno_playerId');
        const savedName = localStorage.getItem('duno_playerName');

        if (!savedRoomId || !savedPlayerId || !savedName) return false;

        try {
            const snap = await db.ref('rooms/' + savedRoomId).once('value');
            if (!snap.exists()) {
                localStorage.removeItem('duno_roomId');
                return false;
            }

            const data = snap.val();
            if (!data.players || !data.players[savedPlayerId]) {
                localStorage.removeItem('duno_roomId');
                return false;
            }

            // Rejoin!
            state.playerId = savedPlayerId;
            state.playerName = savedName;
            state.roomId = savedRoomId;
            state.isHost = data.host === savedPlayerId;

            await db.ref('rooms/' + savedRoomId + '/players/' + savedPlayerId + '/connected').set(true);
            db.ref('rooms/' + savedRoomId + '/players/' + savedPlayerId + '/connected')
                .onDisconnect().set(false);

            if (data.gameState === 'playing' || data.gameState === 'finished') {
                showScreen('screen-game');
            } else {
                showScreen('screen-lobby');
            }

            listenToRoom();
            showToast('Welcome back, ' + savedName + '!');
            SFX.join();
            return true;
        } catch (e) {
            console.error('Rejoin failed:', e);
            return false;
        }
    }

    // ==========================================
    // EVENT LISTENERS
    // ==========================================

    function initEventListeners() {
        // Welcome screen
        document.getElementById('btn-create-room').addEventListener('click', createRoom);
        document.getElementById('btn-show-join').addEventListener('click', () => {
            document.getElementById('join-section').classList.toggle('hidden');
        });
        document.getElementById('btn-join-room').addEventListener('click', joinRoom);

        // Enter key on inputs
        document.getElementById('player-name').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const joinSection = document.getElementById('join-section');
                if (!joinSection.classList.contains('hidden')) {
                    document.getElementById('room-code-input').focus();
                }
            }
        });
        document.getElementById('room-code-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') joinRoom();
        });

        // Force uppercase on room code
        document.getElementById('room-code-input').addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });

        // Lobby
        document.getElementById('btn-copy-code').addEventListener('click', () => {
            navigator.clipboard?.writeText(state.roomId).then(() => {
                showToast('Room code copied!');
            }).catch(() => {
                showToast(state.roomId);
            });
        });
        document.getElementById('btn-start-game').addEventListener('click', startGame);
        document.getElementById('btn-leave-lobby').addEventListener('click', leaveRoom);

        // Game
        document.getElementById('btn-draw').addEventListener('click', drawCard);
        document.getElementById('deck-stack').addEventListener('click', drawCard);
        document.getElementById('btn-duno').addEventListener('click', callDuno);
        document.getElementById('btn-leave-game').addEventListener('click', () => {
            if (confirm('Leave the game? You will be eliminated.')) {
                eliminatePlayer(state.playerId).then(() => leaveRoom());
            }
        });
        document.getElementById('btn-stop-game').addEventListener('click', stopGame);

        // Color picker
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                handleColorChoice(btn.dataset.color);
            });
        });

        // Game over
        document.getElementById('btn-play-again').addEventListener('click', playAgain);
        document.getElementById('btn-back-home').addEventListener('click', goHome);

        // Prevent double-tap zoom on mobile
        document.addEventListener('touchend', (e) => {
            if (e.target.closest('.btn, .card, .color-btn, .deck-stack')) {
                e.preventDefault();
            }
        }, { passive: false });
    }

    // ==========================================
    // INIT
    // ==========================================

    async function init() {
        // Load Firebase config from .env first
        await initFirebase();

        initEventListeners();

        // Try to rejoin existing game
        const rejoined = await attemptRejoin();
        if (!rejoined) {
            showScreen('screen-welcome');
            // Pre-fill name if saved
            const savedName = localStorage.getItem('duno_playerName');
            if (savedName) {
                document.getElementById('player-name').value = savedName;
            }
        }
    }

    // Start the app
    init();

})();
