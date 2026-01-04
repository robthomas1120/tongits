/**
 * ============================================================================
 * TONGITS GAME CLIENT
 * ============================================================================
 * This file handles all client-side game logic, UI rendering, and socket
 * communication for the Tongits card game.
 * 
 * SECTIONS:
 * 1. CONSTANTS & CONFIGURATION
 * 2. DOM ELEMENT REFERENCES
 * 3. GAME STATE VARIABLES
 * 4. SOCKET CONNECTION & EVENTS
 * 5. GAME LOGIC UTILITIES
 * 6. UI RENDERING FUNCTIONS
 * 7. EVENT HANDLERS & LISTENERS
 * 8. MODAL & OVERLAY FUNCTIONS
 * ============================================================================
 */

// ============================================================================
// 1. CONSTANTS & CONFIGURATION
// ============================================================================

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_VALUES = {
    'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
    '8': 8, '9': 9, '10': 10, 'J': 10, 'Q': 10, 'K': 10
};
const GROUP_COLORS = ['#ff5252', '#448aff', '#4caf50', '#ffeb3b', '#e040fb', '#18ffff'];

// ============================================================================
// 2. DOM ELEMENT REFERENCES
// ============================================================================

// Screens
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');

// Lobby Elements
const playerNameInput = document.getElementById('player-name');
const joinBtn = document.getElementById('join-btn');
const playerList = document.getElementById('player-list');
const hostControls = document.getElementById('host-controls');
const addBotBtn = document.getElementById('add-bot-btn');
const startGameBtn = document.getElementById('start-game-btn');
const botDifficulty = document.getElementById('bot-difficulty');

// Game Control Buttons
const sortBtn = document.getElementById('sort-btn');
const groupBtn = document.getElementById('group-btn');
const fightBtn = document.getElementById('fight-btn');
const exposeBtn = document.getElementById('expose-btn');
const suggestBtn = document.getElementById('suggest-btn');
const drawStockBtn = document.getElementById('draw-stock-btn');
const drawDiscardBtn = document.getElementById('draw-discard-btn');
const discardBtn = document.getElementById('discard-btn');

// Game Board Elements
const myHand = document.getElementById('my-hand');
const gameLog = document.getElementById('game-log');
const stockCount = document.getElementById('stock-count');
const sidePotCount = document.getElementById('side-pot-count');
const discardPile = document.getElementById('discard-pile');
const deckPile = document.getElementById('deck-pile');
const dropAreaMain = document.getElementById('drop-area-main');
const myScoreEl = document.getElementById('my-score');
const exposeZoneLeft = document.getElementById('expose-zone-left');
const exposeZoneRight = document.getElementById('expose-zone-right');

// Discard History Modal Elements
const discardHistoryOverlay = document.getElementById('discard-history-overlay');
const closeHistoryBtn = document.getElementById('close-history-btn');
const sortToggleBtn = document.getElementById('sort-toggle-btn');
const sortModeText = document.getElementById('sort-mode-text');
const discardCardGrid = document.getElementById('discard-card-grid');

// ============================================================================
// 3. GAME STATE VARIABLES
// ============================================================================

let myId = null;
let currentGameState = null;
let myCards = [];           // Local hand: { rank, suit, groupId }
let selectedCards = new Set();
let nextGroupId = 1;
let sortMode = 'rank';
let suggestionsEnabled = true;
let isSortedBySuit = false;

// Room ID from URL
const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get('room');

// ============================================================================
// 4. SOCKET CONNECTION & EVENTS
// ============================================================================

const socket = io();

// --- Connection Events ---

socket.on('connect', () => {
    if (roomId) {
        socket.emit('join-room', roomId);
    } else {
        roomId = 'public';
        socket.emit('join-room', 'public');
    }
});

socket.on('join-success', (data) => {
    myId = data.playerId;
});

socket.on('join-fail', (data) => {
    alert(data.message);
    document.getElementById('join-section').classList.remove('hidden');
    document.getElementById('status-section').classList.add('hidden');
});

// --- Lobby Events ---

socket.on('lobby-update', (data) => {
    playerList.innerHTML = '';
    if (data.players.length === 0) {
        playerList.innerHTML = '<div class="player-item"><i>Lobby is empty...</i></div>';
    }

    data.players.forEach(p => {
        const item = document.createElement('div');
        item.className = 'player-item';
        const isMe = p.id === myId;
        item.innerHTML = `<span style="${isMe ? 'color:var(--accent-gold); font-weight:bold;' : ''}">${p.name} ${p.type === 'bot' ? '[BOT]' : ''} ${isMe ? '(You)' : ''}</span>`;
        playerList.appendChild(item);
    });

    if (!document.getElementById('status-section').classList.contains('hidden')) {
        hostControls.classList.remove('hidden');
        addBotBtn.disabled = data.players.length >= 3;
        startGameBtn.disabled = data.players.length !== 3;
    }
});

// --- Game Events ---

socket.on('game-started', (data) => {
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    renderGameState(data.gameState);
});

socket.on('game-update', (data) => {
    renderGameState(data.gameState);
});

// ============================================================================
// 5. GAME LOGIC UTILITIES
// ============================================================================

/**
 * Check if it's currently the local player's turn
 */
function isMyTurn() {
    return currentGameState && currentGameState.players[currentGameState.turnIndex].id === myId;
}

/**
 * Check if the player can draw a card
 */
function canDraw() {
    return isMyTurn() && currentGameState.phase === 'draw';
}

/**
 * Map local card indices to server-side indices
 */
function mapLocalToSvrIdx(localIndices, localHand, svrHand) {
    const selectedHandCards = localIndices.map(i => localHand[i]);
    const serverIndexes = [];
    const tempHand = [...svrHand];
    selectedHandCards.forEach(card => {
        const idx = tempHand.findIndex(c => c && c.rank === card.rank && c.suit === card.suit);
        if (idx !== -1) {
            serverIndexes.push(idx);
            tempHand[idx] = null;
        }
    });
    return serverIndexes;
}

/**
 * Validate if cards form a valid meld (set or run)
 */
function validateMeld(cards) {
    if (cards.length < 3) return false;
    return isSet(cards) || isRun(cards);
}

/**
 * Check if cards form a set (same rank, different suits)
 */
function isSet(cards) {
    if (cards.length < 3 || cards.length > 4) return false;
    const rank = cards[0].rank;
    return cards.every(c => c.rank === rank);
}

/**
 * Check if cards form a run (sequential ranks, same suit)
 */
function isRun(cards) {
    if (cards.length < 3) return false;
    const suit = cards[0].suit;
    if (!cards.every(c => c.suit === suit)) return false;

    const sorted = [...cards].sort((a, b) => RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank));
    for (let i = 0; i < sorted.length - 1; i++) {
        if (RANKS.indexOf(sorted[i + 1].rank) !== RANKS.indexOf(sorted[i].rank) + 1) {
            return false;
        }
    }
    return true;
}

/**
 * Calculate total points in hand (excluding valid grouped melds)
 */
function calculateHandPoints(cards) {
    const meldedCardIndices = new Set();
    const groupMap = {};

    cards.forEach((c, i) => {
        if (c.groupId) {
            if (!groupMap[c.groupId]) groupMap[c.groupId] = [];
            groupMap[c.groupId].push({ ...c, index: i });
        }
    });

    for (const gid in groupMap) {
        if (validateMeld(groupMap[gid])) {
            groupMap[gid].forEach(c => meldedCardIndices.add(c.index));
        }
    }

    return cards.reduce((sum, card, idx) => {
        if (meldedCardIndices.has(idx)) return sum;
        return sum + (RANK_VALUES[card.rank] || 0);
    }, 0);
}

/**
 * Find matching melds for a discard card
 */
function findMatches(hand, card) {
    const matches = [];

    // Sets (same rank)
    const sameRankIndices = hand.map((c, i) => c.rank === card.rank ? i : -1).filter(i => i !== -1);
    if (sameRankIndices.length >= 2) matches.push(sameRankIndices);

    // Runs (sequential ranks, same suit)
    const sameSuit = hand.map((c, i) => c.suit === card.suit ? { idx: i, rIdx: RANKS.indexOf(c.rank) } : null).filter(x => x);
    const cardRIdx = RANKS.indexOf(card.rank);

    const nearRanks = sameSuit.filter(x => Math.abs(x.rIdx - cardRIdx) <= 2);
    if (nearRanks.length >= 2) {
        const rIndices = nearRanks.map(x => x.rIdx).concat(cardRIdx).sort((a, b) => a - b);
        for (let i = 0; i <= rIndices.length - 3; i++) {
            if (rIndices[i + 1] === rIndices[i] + 1 && rIndices[i + 2] === rIndices[i + 1] + 1) {
                if ([rIndices[i], rIndices[i + 1], rIndices[i + 2]].includes(cardRIdx)) {
                    const matchIdx = nearRanks.filter(x => [rIndices[i], rIndices[i + 1], rIndices[i + 2]].includes(x.rIdx) && x.rIdx !== cardRIdx).map(x => x.idx);
                    matches.push(matchIdx);
                }
            }
        }
    }
    return matches;
}

/**
 * Sort the local hand based on current sort mode
 */
function applySort() {
    myCards.sort((a, b) => {
        if (sortMode === 'rank') {
            if (a.rank !== b.rank) return RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank);
            return a.suit.localeCompare(b.suit);
        } else {
            if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
            return RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank);
        }
    });
}

// ============================================================================
// 6. UI RENDERING FUNCTIONS
// ============================================================================

/**
 * Main function to render the complete game state
 */
function renderGameState(state) {
    currentGameState = state;
    const me = state.players.find(p => p.id === myId);
    if (!me) return;

    // Update player slots
    const playerIndex = state.players.findIndex(p => p.id === myId);
    const leftPlayer = state.players[(playerIndex + 1) % 3];
    const rightPlayer = state.players[(playerIndex + 2) % 3];

    updatePlayerSlot('player-bottom', me, state.players[state.turnIndex].id === myId);
    updatePlayerSlot('player-left', leftPlayer, state.players[state.turnIndex].id === leftPlayer.id);
    updatePlayerSlot('player-right', rightPlayer, state.players[state.turnIndex].id === rightPlayer.id);

    // Update counters
    stockCount.innerText = state.stockCount;
    sidePotCount.innerText = `$${state.sidePot.toLocaleString()}`;

    // Update personal score
    if (myScoreEl) {
        const points = calculateHandPoints(myCards);
        myScoreEl.innerText = `Points: ${points}`;
    }

    // Handle game over
    const overlay = document.getElementById('game-over-overlay') || createGameOverOverlay();
    if (state.status === 'ended' && state.roundResults) {
        overlay.classList.remove('hidden');
        renderResults(overlay, state.roundResults);
    } else {
        overlay.classList.add('hidden');
    }

    // Update discard pile
    renderDiscardPile(state);

    // Sync hand with server
    syncHand(me.hand);
    renderHand(myCards);

    // Update control buttons
    const myTurn = state.players[state.turnIndex].id === myId;
    updateControlButtons(myTurn, state);

    // Update game log
    renderGameLog(state, myTurn);

    // Handle expose zones and fight button
    renderExposeZones(myTurn, state, me);
}

/**
 * Render the discard pile
 */
function renderDiscardPile(state) {
    discardPile.innerHTML = '';
    const topDiscard = state.discardPile.length > 0 ? state.discardPile[state.discardPile.length - 1] : null;

    if (topDiscard) {
        discardPile.appendChild(createCardElement(topDiscard));
        const matches = findMatches(myCards, topDiscard);
        const myTurn = state.players[state.turnIndex].id === myId;
        const isDrawPhase = state.phase === 'draw';
        const canActuallyPickUp = matches.length > 0;

        if (myTurn && isDrawPhase && !canActuallyPickUp) {
            drawDiscardBtn.classList.add('disabled');
        } else {
            drawDiscardBtn.classList.remove('disabled');
        }
    } else {
        discardPile.innerHTML = '<div class="empty-slot">DISCARD</div>';
        drawDiscardBtn.classList.add('disabled');
    }
    discardPile.classList.remove('disabled');
}

/**
 * Sync local hand with server hand
 */
function syncHand(serverHand) {
    if (myCards.length !== serverHand.length) {
        const oldGroups = myCards.map(c => ({ rank: c.rank, suit: c.suit, gid: c.groupId }));
        myCards = serverHand.map(c => {
            const old = oldGroups.find(og => og.rank === c.rank && og.suit === c.suit);
            return { ...c, groupId: old ? old.gid : null };
        });
        applySort();
    }
}

/**
 * Update control button states
 */
function updateControlButtons(myTurn, state) {
    drawStockBtn.disabled = !myTurn || state.phase !== 'draw';
    drawDiscardBtn.disabled = !myTurn || state.phase !== 'draw' || state.discardPile.length === 0;
    discardBtn.disabled = !myTurn || state.phase !== 'action' || selectedCards.size !== 1;
    exposeBtn.disabled = !myTurn || state.phase !== 'action' || selectedCards.size < 3;
}

/**
 * Render game log with hints
 */
function renderGameLog(state, myTurn) {
    gameLog.innerHTML = state.logs.map(l => `<div>[${l.time}] ${l.message}</div>`).join('');

    if (myTurn && state.phase === 'draw') {
        gameLog.innerHTML += `<div class="hint" style="color:var(--accent-gold); font-weight:bold; padding: 5px 0;">💡 Click Deck or Discard to Draw.</div>`;
        const topDiscard = state.discardPile[state.discardPile.length - 1];
        highlightMatches(topDiscard);
    } else if (myTurn && state.phase === 'action') {
        if (selectedCards.size === 0) {
            gameLog.innerHTML += `<div class="hint" style="color:var(--accent-gold); font-weight:bold; padding: 5px 0;">💡 Select card to Discard or Expose.</div>`;
        } else if (selectedCards.size === 1) {
            gameLog.innerHTML += `<div class="hint" style="color:var(--accent-gold); font-weight:bold; padding: 5px 0;">💡 Click Discard Pile to discard.</div>`;
        }
    }

    gameLog.scrollTop = gameLog.scrollHeight;
}

/**
 * Render expose zones and fight button logic
 */
function renderExposeZones(myTurn, state, me) {
    if (myTurn && state.phase === 'action') {
        exposeZoneLeft.classList.remove('hidden');
        exposeZoneRight.classList.remove('hidden');

        if (me && me.hasOpened) {
            const anySapawable = me.exposedMelds.some(m => !m.isSapawedByOthers);
            const isOpeningTurn = me.openedThisTurn;
            fightBtn.disabled = !anySapawable || isOpeningTurn;

            if (isOpeningTurn && anySapawable) {
                gameLog.innerHTML += `<div class="hint" style="color:#ffcc00; font-weight:bold; padding: 5px 0;">🚫 You cannot call a FIGHT on the turn you open.</div>`;
            }
        } else {
            fightBtn.disabled = true;
        }
    } else {
        exposeZoneLeft.classList.add('hidden');
        exposeZoneRight.classList.add('hidden');
        fightBtn.disabled = true;
    }
}

/**
 * Highlight matching cards in hand
 */
function highlightMatches(discardCard) {
    if (!discardCard) return;
    const matches = findMatches(myCards, discardCard);

    document.querySelectorAll('#my-hand .card').forEach((el, idx) => {
        el.classList.remove('match-highlight');
        if (matches.some(m => m.includes(idx))) {
            el.classList.add('match-highlight');
            el.dataset.matchIndices = matches.find(m => m.includes(idx)).join(',');
        }
    });

    if (matches.length > 1) {
        gameLog.innerHTML += `<div class="hint" style="color:#00e5ff; font-weight:bold;">🔥 Card matches multiple melds! Select the cards you want.</div>`;
    }
}

/**
 * Update a player slot (left, right, or bottom)
 */
function updatePlayerSlot(slotId, player, isActive) {
    const slot = document.getElementById(slotId);
    if (!player) {
        slot.classList.add('hidden');
        return;
    }
    slot.classList.remove('hidden');

    slot.classList.toggle('active-turn', isActive);

    const nameEl = slot.querySelector('.name') || document.getElementById('my-name');
    const chipsEl = slot.querySelector('.chips') || document.getElementById('my-chips');

    if (nameEl) nameEl.innerText = player.name;
    if (chipsEl) chipsEl.innerText = `$${player.chips.toLocaleString()}`;

    // Render opponent hand (card backs)
    if (slotId !== 'player-bottom') {
        const handMini = slot.querySelector('.hand-mini');
        handMini.innerHTML = '';
        const count = player.handCount || (player.hand ? player.hand.length : 0);
        for (let i = 0; i < count; i++) {
            const card = document.createElement('div');
            card.className = 'card-mini';
            handMini.appendChild(card);
        }
    }

    // Render exposed melds with sapaw listeners
    renderExposedMelds(slot, player);
}

/**
 * Render exposed melds for a player slot
 */
function renderExposedMelds(slot, player) {
    const exposedContainer = slot.querySelector('.exposed-melds');
    if (!exposedContainer) return;

    exposedContainer.innerHTML = '';
    player.exposedMelds.forEach((meld, meldIndex) => {
        const groupEl = document.createElement('div');
        groupEl.className = 'meld-group';

        // Sapaw click handler
        groupEl.addEventListener('click', () => handleSapawClick(player.id, meldIndex));

        // Sapaw drag handlers
        groupEl.addEventListener('dragover', (e) => {
            if (isMyTurn() && currentGameState.phase === 'action') {
                e.preventDefault();
                groupEl.classList.add('drag-over');
            }
        });
        groupEl.addEventListener('dragleave', () => groupEl.classList.remove('drag-over'));
        groupEl.addEventListener('drop', (e) => handleSapawDrop(e, player.id, meldIndex, groupEl));

        // Render meld cards
        meld.cards.forEach(card => {
            const cardEl = document.createElement('div');
            cardEl.className = `card-mini ${['♥', '♦'].includes(card.suit) ? 'red' : ''}`;
            cardEl.innerHTML = `<span class="rank">${card.rank}</span><span class="suit-main">${card.suit}</span>`;
            groupEl.appendChild(cardEl);
        });

        exposedContainer.appendChild(groupEl);
    });
}

/**
 * Render the player's hand
 */
function renderHand(cards) {
    myHand.innerHTML = '';

    cards.forEach((card, index) => {
        const cardEl = createCardElement(card);
        cardEl.dataset.index = index;
        cardEl.draggable = true;
        if (selectedCards.has(index)) cardEl.classList.add('selected');

        // Add group indicator if card is grouped
        if (card.groupId) {
            renderGroupIndicator(cardEl, card, cards, index);
        }

        // Card event listeners
        cardEl.addEventListener('click', () => handleCardClick(cardEl, index, cards, card));
        cardEl.addEventListener('dragstart', (e) => handleCardDragStart(e, cardEl, index));
        cardEl.addEventListener('dragend', () => cardEl.classList.remove('dragging'));
        cardEl.addEventListener('dragover', (e) => e.preventDefault());
        cardEl.addEventListener('drop', (e) => handleCardDrop(e, index));

        myHand.appendChild(cardEl);
    });
}

/**
 * Render group indicator on a card
 */
function renderGroupIndicator(cardEl, card, cards, index) {
    const groupCards = cards.filter(c => c.groupId === card.groupId);
    const isValid = validateMeld(groupCards);

    const indicator = document.createElement('div');
    indicator.className = 'group-indicator';
    indicator.style.backgroundColor = isValid ? GROUP_COLORS[card.groupId % GROUP_COLORS.length] : '#888';
    cardEl.appendChild(indicator);

    // One-click expose for valid groups
    if (isValid && isMyTurn() && currentGameState.phase === 'action') {
        indicator.style.cursor = 'pointer';
        indicator.title = 'Click to Drop (Expose)';
        indicator.addEventListener('click', (e) => {
            e.stopPropagation();
            const indices = cards.map((c, i) => c.groupId === card.groupId ? i : -1).filter(i => i !== -1);
            const serverMe = currentGameState.players.find(p => p.id === myId);
            const serverIndices = mapLocalToSvrIdx(indices, myCards, serverMe.hand);
            socket.emit('expose-meld', { cardIndexes: serverIndices });
            selectedCards.clear();
        });
    }
}

/**
 * Create a card DOM element
 */
function createCardElement(card) {
    const cardEl = document.createElement('div');
    cardEl.className = `card ${['♥', '♦'].includes(card.suit) ? 'red' : ''}`;
    cardEl.innerHTML = `<span class="rank">${card.rank}</span><span class="suit-main">${card.suit}</span>`;
    return cardEl;
}

/**
 * Update action button states based on selection
 */
function updateActionButtons() {
    const myTurn = currentGameState && currentGameState.players[currentGameState.turnIndex].id === myId;
    discardBtn.disabled = !myTurn || currentGameState.phase !== 'action' || selectedCards.size !== 1;
    exposeBtn.disabled = !myTurn || currentGameState.phase !== 'action' || selectedCards.size < 3;
}

// ============================================================================
// 7. EVENT HANDLERS & LISTENERS
// ============================================================================

/**
 * Handle card click events
 */
function handleCardClick(cardEl, index, cards, card) {
    // Quick-expose logic for highlighted matches
    if (cardEl.classList.contains('match-highlight') && canDraw()) {
        const matchIndices = cardEl.dataset.matchIndices.split(',').map(Number);
        const serverMe = currentGameState.players.find(p => p.id === myId);
        const serverIndexes = mapLocalToSvrIdx(matchIndices, myCards, serverMe.hand);
        socket.emit('draw-discard', { meldIndexes: serverIndexes });
        selectedCards.clear();
        return;
    }

    // Toggle selection
    if (selectedCards.has(index)) {
        selectedCards.delete(index);
        cardEl.classList.remove('selected');
    } else {
        selectedCards.add(index);
        cardEl.classList.add('selected');
    }
    updateActionButtons();
}

/**
 * Handle card drag start
 */
function handleCardDragStart(e, cardEl, index) {
    cardEl.classList.add('dragging');
    if (selectedCards.has(index)) {
        e.dataTransfer.setData('text/plain', 'group');
    } else {
        e.dataTransfer.setData('text/plain', index);
    }
}

/**
 * Handle card drop (reordering)
 */
function handleCardDrop(e, toIndex) {
    e.preventDefault();
    const data = e.dataTransfer.getData('text/plain');
    if (data === 'group') return;

    const fromIndex = parseInt(data);
    if (fromIndex !== toIndex) {
        const movedCard = myCards.splice(fromIndex, 1)[0];
        myCards.splice(toIndex, 0, movedCard);
        renderHand(myCards);
    }
}

/**
 * Handle sapaw click on meld
 */
function handleSapawClick(targetPlayerId, meldIndex) {
    if (selectedCards.size === 1 && currentGameState.phase === 'action' && isMyTurn()) {
        const localIdx = Array.from(selectedCards)[0];
        const selectedCard = myCards[localIdx];
        const serverMe = currentGameState.players.find(p => p.id === myId);
        const serverIdx = serverMe.hand.findIndex(c => c && c.rank === selectedCard.rank && c.suit === selectedCard.suit);

        if (serverIdx !== -1) {
            socket.emit('sapaw', { targetPlayerId, meldIndex, cardIndex: serverIdx });
            selectedCards.clear();
            renderHand(myCards);
        }
    }
}

/**
 * Handle sapaw drop on meld
 */
function handleSapawDrop(e, targetPlayerId, meldIndex, groupEl) {
    e.preventDefault();
    groupEl.classList.remove('drag-over');
    if (!isMyTurn() || currentGameState.phase !== 'action') return;

    const data = e.dataTransfer.getData('text/plain');
    if (data === 'group') return;

    const localIdx = parseInt(data);
    if (!isNaN(localIdx)) {
        const selectedCard = myCards[localIdx];
        const serverMe = currentGameState.players.find(p => p.id === myId);
        const serverIdx = serverMe.hand.findIndex(c => c && c.rank === selectedCard.rank && c.suit === selectedCard.suit);

        if (serverIdx !== -1) {
            socket.emit('sapaw', { targetPlayerId, meldIndex, cardIndex: serverIdx });
            selectedCards.clear();
            renderHand(myCards);
        }
    }
}

/**
 * Perform discard action
 */
function performDiscard(localIdx) {
    if (isMyTurn() && currentGameState.phase === 'action') {
        const selectedCard = myCards[localIdx];
        const serverMe = currentGameState.players.find(p => p.id === myId);
        if (!serverMe) return;
        const serverIdx = serverMe.hand.findIndex(c => c && c.rank === selectedCard.rank && c.suit === selectedCard.suit);
        if (serverIdx !== -1) {
            socket.emit('discard', { cardIndex: serverIdx });
            selectedCards.clear();
            renderHand(myCards);
        }
    }
}

// --- Lobby Button Listeners ---

joinBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (name) {
        socket.emit('join-lobby', { name });
        document.getElementById('join-section').classList.add('hidden');
        document.getElementById('status-section').classList.remove('hidden');
    }
});

addBotBtn.addEventListener('click', () => {
    socket.emit('add-bot', { difficulty: botDifficulty.value });
});

startGameBtn.addEventListener('click', () => {
    socket.emit('start-game');
});

// --- Game Action Button Listeners ---

drawStockBtn.addEventListener('click', () => socket.emit('draw-stock'));

drawDiscardBtn.addEventListener('click', () => {
    const serverMe = currentGameState.players.find(p => p.id === myId);
    const serverIndexes = mapLocalToSvrIdx(Array.from(selectedCards), myCards, serverMe.hand);
    socket.emit('draw-discard', { meldIndexes: serverIndexes });
    selectedCards.clear();
});

discardBtn.addEventListener('click', () => {
    if (selectedCards.size === 1) {
        const selectedCard = myCards[Array.from(selectedCards)[0]];
        const serverMe = currentGameState.players.find(p => p.id === myId);
        const serverIdx = serverMe.hand.findIndex(c => c && c.rank === selectedCard.rank && c.suit === selectedCard.suit);
        if (serverIdx !== -1) {
            socket.emit('discard', { cardIndex: serverIdx });
            selectedCards.clear();
        }
    } else {
        alert('Select 1 card to discard.');
    }
});

sortBtn.addEventListener('click', () => {
    sortMode = sortMode === 'rank' ? 'suit' : 'rank';
    sortBtn.innerText = `Sort: ${sortMode.charAt(0).toUpperCase() + sortMode.slice(1)}`;
    applySort();
    renderHand(myCards);
});

fightBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to call a FIGHT? You must have the lowest points to win!")) {
        socket.emit('call-fight');
    }
});

groupBtn.addEventListener('click', () => {
    if (selectedCards.size < 1) return;

    const indices = Array.from(selectedCards).sort((a, b) => a - b);
    const firstGroupId = myCards[indices[0]].groupId;
    const allSameGroup = firstGroupId && indices.every(i => myCards[i].groupId === firstGroupId);

    if (allSameGroup && indices.length > 1) {
        // Ungroup
        indices.forEach(i => myCards[i].groupId = null);
    } else {
        // Group
        const gid = nextGroupId++;
        indices.forEach(i => myCards[i].groupId = gid);

        // Move cards together
        const targetIdx = indices[0];
        const cardsToMove = indices.map(i => myCards[i]);
        indices.reverse().forEach(i => myCards.splice(i, 1));
        myCards.splice(targetIdx, 0, ...cardsToMove);
        selectedCards.clear();
    }
    renderHand(myCards);
});

exposeBtn.addEventListener('click', () => {
    if (selectedCards.size >= 3) {
        const serverMe = currentGameState.players.find(p => p.id === myId);
        const serverIndices = mapLocalToSvrIdx(Array.from(selectedCards), myCards, serverMe.hand);
        socket.emit('expose-meld', { cardIndexes: serverIndices });
        selectedCards.clear();
    }
});

suggestBtn.addEventListener('click', () => {
    suggestionsEnabled = !suggestionsEnabled;
    suggestBtn.innerText = `Sug: ${suggestionsEnabled ? 'ON' : 'OFF'}`;
    renderHand(myCards);
});

// --- Pile & Zone Listeners ---

deckPile.addEventListener('dragover', (e) => {
    if (isMyTurn() && currentGameState.phase === 'draw') {
        e.preventDefault();
        deckPile.classList.add('drag-over');
    }
});
deckPile.addEventListener('dragleave', () => deckPile.classList.remove('drag-over'));
deckPile.addEventListener('drop', (e) => {
    e.preventDefault();
    deckPile.classList.remove('drag-over');
    if (canDraw()) socket.emit('draw-stock');
});
deckPile.addEventListener('click', () => {
    if (canDraw()) socket.emit('draw-stock');
});

discardPile.addEventListener('dragover', (e) => {
    if (isMyTurn() && currentGameState.phase === 'action') {
        e.preventDefault();
        discardPile.classList.add('drag-over');
    }
});
discardPile.addEventListener('dragleave', () => discardPile.classList.remove('drag-over'));
discardPile.addEventListener('drop', (e) => {
    e.preventDefault();
    discardPile.classList.remove('drag-over');
    const data = e.dataTransfer.getData('text/plain');
    if (data === 'group') return;
    const localIdx = parseInt(data);
    if (!isNaN(localIdx)) performDiscard(localIdx);
});
discardPile.addEventListener('click', () => {
    if (currentGameState && currentGameState.players[currentGameState.turnIndex].id === myId) {
        if (currentGameState.phase === 'draw') {
            const serverMe = currentGameState.players.find(p => p.id === myId);
            const serverIndexes = mapLocalToSvrIdx(Array.from(selectedCards), myCards, serverMe.hand);
            socket.emit('draw-discard', { meldIndexes: serverIndexes });
            selectedCards.clear();
        } else if (currentGameState.phase === 'action' && selectedCards.size === 1) {
            const selectedCard = myCards[Array.from(selectedCards)[0]];
            const serverMe = currentGameState.players.find(p => p.id === myId);
            const serverIdx = serverMe.hand.findIndex(c => c && c.rank === selectedCard.rank && c.suit === selectedCard.suit);
            if (serverIdx !== -1) {
                socket.emit('discard', { cardIndex: serverIdx });
                selectedCards.clear();
            }
        } else if (currentGameState.phase === 'action' && selectedCards.size === 0) {
            showDiscardHistory();
        }
    } else {
        showDiscardHistory();
    }
});

dropAreaMain.addEventListener('dragover', (e) => e.preventDefault());
dropAreaMain.addEventListener('drop', (e) => {
    e.preventDefault();
    if (selectedCards.size >= 3) {
        const serverMe = currentGameState.players.find(p => p.id === myId);
        const serverIndices = mapLocalToSvrIdx(Array.from(selectedCards), myCards, serverMe.hand);
        socket.emit('expose-meld', { cardIndexes: serverIndices });
        selectedCards.clear();
    }
});

[exposeZoneLeft, exposeZoneRight].forEach(zone => {
    zone.addEventListener('dragover', (e) => {
        if (isMyTurn() && currentGameState.phase === 'action') {
            e.preventDefault();
            zone.classList.add('drag-over');
        }
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');

        const data = e.dataTransfer.getData('text/plain');
        if (data === 'group') {
            const indices = Array.from(selectedCards);
            const cardsInGroup = indices.map(i => myCards[i]);
            if (validateMeld(cardsInGroup)) {
                const serverMe = currentGameState.players.find(p => p.id === myId);
                const serverIndices = mapLocalToSvrIdx(indices, myCards, serverMe.hand);
                socket.emit('expose-meld', { cardIndexes: serverIndices });
                selectedCards.clear();
            }
        } else {
            const cardIdx = parseInt(data);
            if (!isNaN(cardIdx)) {
                const card = myCards[cardIdx];
                if (card && card.groupId) {
                    const groupCards = myCards.filter(c => c.groupId === card.groupId);
                    if (validateMeld(groupCards)) {
                        const indices = myCards.map((c, i) => c.groupId === card.groupId ? i : -1).filter(i => i !== -1);
                        const serverMe = currentGameState.players.find(p => p.id === myId);
                        const serverIndices = mapLocalToSvrIdx(indices, myCards, serverMe.hand);
                        socket.emit('expose-meld', { cardIndexes: serverIndices });
                        selectedCards.clear();
                    }
                }
            }
        }
    });
});

// ============================================================================
// 8. MODAL & OVERLAY FUNCTIONS
// ============================================================================

/**
 * Create the game over overlay
 */
function createGameOverOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'game-over-overlay';
    overlay.className = 'glass-panel hidden';
    overlay.style.position = 'fixed';
    overlay.style.top = '50%';
    overlay.style.left = '50%';
    overlay.style.transform = 'translate(-50%, -50%)';
    overlay.style.zIndex = '20000';
    overlay.style.minWidth = '300px';
    overlay.style.pointerEvents = 'auto';

    overlay.innerHTML = `
        <h2>Round Over</h2>
        <div id="results-list" style="margin: 20px 0; text-align: left;"></div>
        <button id="next-round-btn" class="primary-btn">Back to Lobby</button>
    `;
    document.getElementById('game-container').appendChild(overlay);

    document.getElementById('next-round-btn').addEventListener('click', () => {
        overlay.classList.add('hidden');
        location.reload();
    });

    return overlay;
}

/**
 * Render game results in overlay
 */
function renderResults(overlay, results) {
    const list = document.getElementById('results-list');
    list.innerHTML = '';

    const title = results.type === 'tongit' ? 'TONGITS!' : 'Deck Empty (Points Result)';
    overlay.querySelector('h2').innerText = title;

    results.players.forEach(p => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.padding = '5px 0';
        row.style.borderBottom = '1px solid rgba(255,255,255,0.1)';

        if (p.isWinner) {
            row.style.color = 'var(--accent-gold)';
            row.style.fontWeight = 'bold';
        }

        row.innerHTML = `
            <span>${p.name} ${p.isWinner ? '🏆' : ''}${p.isBurned ? '<span class="burned-badge">BURNED</span>' : ''}</span>
            <span>${p.weight} pts</span>
        `;
        list.appendChild(row);
    });
}

/**
 * Show discard history modal
 */
function showDiscardHistory() {
    if (!currentGameState || !currentGameState.discardPile || currentGameState.discardPile.length === 0) {
        return;
    }

    isSortedBySuit = false;
    sortModeText.innerText = 'Chronological';
    renderDiscardHistory();
    discardHistoryOverlay.classList.remove('hidden');
}

/**
 * Render discard history cards
 */
function renderDiscardHistory() {
    discardCardGrid.innerHTML = '';
    let cardsToDisplay = [...currentGameState.discardPile];

    if (isSortedBySuit) {
        const SUITS = ['♠', '♥', '♦', '♣'];
        cardsToDisplay.sort((a, b) => {
            const suitDiff = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
            if (suitDiff !== 0) return suitDiff;
            return RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank);
        });
    }

    cardsToDisplay.forEach(card => {
        const cardEl = createCardElement(card);
        discardCardGrid.appendChild(cardEl);
    });
}

/**
 * Toggle discard history sort mode
 */
function toggleSort() {
    isSortedBySuit = !isSortedBySuit;
    sortModeText.innerText = isSortedBySuit ? 'By Suit/Rank' : 'Chronological';
    renderDiscardHistory();
}

/**
 * Close discard history modal
 */
function closeDiscardHistory() {
    discardHistoryOverlay.classList.add('hidden');
}

// Discard History Modal Listeners
closeHistoryBtn.addEventListener('click', closeDiscardHistory);
sortToggleBtn.addEventListener('click', toggleSort);
discardHistoryOverlay.addEventListener('click', (e) => {
    if (e.target === discardHistoryOverlay) {
        closeDiscardHistory();
    }
});

// ============================================================================
// 9. INITIALIZATION
// ============================================================================

// Room UI Setup
if (!roomId) {
    const createRoomBtn = document.createElement('button');
    createRoomBtn.innerText = 'Create Private Lobby';
    createRoomBtn.className = 'btn-secondary';
    createRoomBtn.style.marginTop = '10px';
    createRoomBtn.onclick = () => {
        const newRoom = Math.random().toString(36).substring(2, 8);
        window.location.search = `?room=${newRoom}`;
    };
    document.getElementById('join-section').appendChild(createRoomBtn);
} else {
    // Show Invite Link Button
    const inviteBtn = document.createElement('button');
    inviteBtn.innerText = 'Copy Invite Link';
    inviteBtn.className = 'btn-small';
    inviteBtn.style.position = 'absolute';
    inviteBtn.style.top = '10px';
    inviteBtn.style.right = '10px';
    inviteBtn.onclick = () => {
        navigator.clipboard.writeText(window.location.href).then(() => {
            inviteBtn.innerText = 'Copied!';
            setTimeout(() => inviteBtn.innerText = 'Copy Invite Link', 2000);
        });
    };
    document.body.appendChild(inviteBtn);

    // Show Room Indicator
    const roomIndicator = document.createElement('div');
    roomIndicator.innerText = `Room: ${roomId}`;
    roomIndicator.style.position = 'absolute';
    roomIndicator.style.top = '10px';
    roomIndicator.style.left = '10px';
    roomIndicator.style.background = 'rgba(0,0,0,0.5)';
    roomIndicator.style.color = 'white';
    roomIndicator.style.padding = '5px 10px';
    roomIndicator.style.borderRadius = '5px';
    roomIndicator.style.zIndex = '1000';
    document.body.appendChild(roomIndicator);
}
