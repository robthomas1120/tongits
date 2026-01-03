const socket = io();

// UI Elements
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const playerNameInput = document.getElementById('player-name');
const joinBtn = document.getElementById('join-btn');
const playerList = document.getElementById('player-list');
const hostControls = document.getElementById('host-controls');
const addBotBtn = document.getElementById('add-bot-btn');
const startGameBtn = document.getElementById('start-game-btn');
const botDifficulty = document.getElementById('bot-difficulty');
const sortBtn = document.getElementById('sort-btn');
const groupBtn = document.getElementById('group-btn');
const exposeBtn = document.getElementById('expose-btn');
const suggestBtn = document.getElementById('suggest-btn');
const myHand = document.getElementById('my-hand');
const gameLog = document.getElementById('game-log');
const drawStockBtn = document.getElementById('draw-stock-btn');
const drawDiscardBtn = document.getElementById('draw-discard-btn');
const discardBtn = document.getElementById('discard-btn');
const stockCount = document.getElementById('stock-count');
const sidePotCount = document.getElementById('side-pot-count');
const discardPile = document.getElementById('discard-pile');
const deckPile = document.getElementById('deck-pile');
const dropAreaMain = document.getElementById('drop-area-main');

let myId = null;
let selectedCards = new Set();
let currentGameState = null;
let sortMode = 'rank';
let suggestionsEnabled = true;

// New State for Interactions
let myCards = []; // { rank, suit, groupId }
let groups = {}; // groupId -> { color }
let nextGroupId = 1;
const GROUP_COLORS = ['#ff5252', '#448aff', '#4caf50', '#ffeb3b', '#e040fb', '#18ffff'];

// Lobby Logic
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

// Pile Click Interactions
const isMyTurn = () => currentGameState && currentGameState.players[currentGameState.turnIndex].id === myId;

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
        }
    }
});

function canDraw() {
    return isMyTurn() && currentGameState.phase === 'draw';
}

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

// Gameplay Actions
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

groupBtn.addEventListener('click', () => {
    if (selectedCards.size < 1) return;

    const indices = Array.from(selectedCards).sort((a, b) => a - b);
    const firstGroupId = myCards[indices[0]].groupId;
    const allSameGroup = firstGroupId && indices.every(i => myCards[i].groupId === firstGroupId);

    if (allSameGroup && indices.length > 1) {
        indices.forEach(i => myCards[i].groupId = null);
    } else {
        const gid = nextGroupId++;
        groups[gid] = { color: GROUP_COLORS[gid % GROUP_COLORS.length] };
        indices.forEach(i => myCards[i].groupId = gid);

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

// Helper for mapping
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

// Drop Area Logic
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

socket.on('join-success', (data) => {
    myId = data.playerId;
});

socket.on('join-fail', (data) => {
    alert(data.message);
    document.getElementById('join-section').classList.remove('hidden');
    document.getElementById('status-section').classList.add('hidden');
});

socket.on('lobby-update', (data) => {
    playerList.innerHTML = '';
    if (data.players.length === 0) {
        playerList.innerHTML = '<div class="player-item"><i>Lobby is empty...</i></div>';
    }

    data.players.forEach(p => {
        const item = document.createElement('div');
        item.className = 'player-item';
        // Highlight local player
        const isMe = p.id === myId;
        item.innerHTML = `<span style="${isMe ? 'color:var(--accent-gold); font-weight:bold;' : ''}">${p.name} ${p.type === 'bot' ? '[BOT]' : ''} ${isMe ? '(You)' : ''}</span>`;
        playerList.appendChild(item);
    });

    // Always show host controls if joined, but button enabled only if 3 players
    if (!document.getElementById('status-section').classList.contains('hidden')) {
        hostControls.classList.remove('hidden');
        addBotBtn.disabled = data.players.length >= 3;
        startGameBtn.disabled = data.players.length !== 3;
    }
});

socket.on('game-started', (data) => {
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    renderGameState(data.gameState);
});

socket.on('game-update', (data) => {
    renderGameState(data.gameState);
});

function renderGameState(state) {
    currentGameState = state;
    const me = state.players.find(p => p.id === myId);
    if (!me) return;

    const playerIndex = state.players.findIndex(p => p.id === myId);
    const leftPlayer = state.players[(playerIndex + 1) % 3];
    const rightPlayer = state.players[(playerIndex + 2) % 3];

    updatePlayerSlot('player-bottom', me, state.players[state.turnIndex].id === myId);
    updatePlayerSlot('player-left', leftPlayer, state.players[state.turnIndex].id === leftPlayer.id);
    updatePlayerSlot('player-right', rightPlayer, state.players[state.turnIndex].id === rightPlayer.id);

    stockCount.innerText = state.stockCount;
    sidePotCount.innerText = `$${state.sidePot.toLocaleString()}`;

    // Game Over Overlay
    const overlay = document.getElementById('game-over-overlay') || createGameOverOverlay();
    if (state.status === 'ended' && state.roundResults) {
        overlay.classList.remove('hidden');
        renderResults(overlay, state.roundResults);
    } else {
        overlay.classList.add('hidden');
    }

    // Discard Pile Usability
    discardPile.innerHTML = '';
    const topDiscard = state.discardPile.length > 0 ? state.discardPile[state.discardPile.length - 1] : null;
    if (topDiscard) {
        discardPile.appendChild(createCardElement(topDiscard));
        const matches = findMatches(myCards, topDiscard);
        const myTurn = state.players[state.turnIndex].id === myId;
        const isDrawPhase = state.phase === 'draw';
        const canActuallyPickUp = matches.length > 0;

        // Make button transparent if it's my turn to draw but I CANNOT use the discard
        if (myTurn && isDrawPhase && !canActuallyPickUp) {
            drawDiscardBtn.classList.add('disabled');
        } else {
            drawDiscardBtn.classList.remove('disabled');
        }
    } else {
        discardPile.innerHTML = '<div class="empty-slot">DISCARD</div>';
        drawDiscardBtn.classList.add('disabled');
    }
    discardPile.classList.remove('disabled'); // Ensure pile itself is not transparent

    // Hand Sync
    if (myCards.length !== me.hand.length) {
        const oldGroups = myCards.map(c => ({ rank: c.rank, suit: c.suit, gid: c.groupId }));
        myCards = me.hand.map(c => {
            const old = oldGroups.find(og => og.rank === c.rank && og.suit === c.suit);
            return { ...c, groupId: old ? old.gid : null };
        });
        applySort();
    }
    renderHand(myCards);

    // Controls
    const myTurn = state.players[state.turnIndex].id === myId;
    drawStockBtn.disabled = !myTurn || state.phase !== 'draw';
    drawDiscardBtn.disabled = !myTurn || state.phase !== 'draw' || state.discardPile.length === 0;
    discardBtn.disabled = !myTurn || state.phase !== 'action' || selectedCards.size !== 1;
    exposeBtn.disabled = !myTurn || state.phase !== 'action' || selectedCards.size < 3;

    gameLog.innerHTML = state.logs.map(l => `<div>[${l.time}] ${l.message}</div>`).join('');

    if (myTurn && state.phase === 'draw') {
        gameLog.innerHTML += `<div class="hint" style="color:var(--accent-gold); font-weight:bold; padding: 5px 0;">💡 Click Deck or Discard to Draw.</div>`;
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

function highlightMatches(discardCard) {
    if (!discardCard) return;
    const matches = findMatches(myCards, discardCard);

    document.querySelectorAll('#my-hand .card').forEach((el, idx) => {
        el.classList.remove('match-highlight');
        if (matches.some(m => m.includes(idx))) {
            el.classList.add('match-highlight');
            // Store match info on the element for quick-expose
            el.dataset.matchIndices = matches.find(m => m.includes(idx)).join(',');
        }
    });

    if (matches.length > 1) {
        gameLog.innerHTML += `<div class="hint" style="color:#00e5ff; font-weight:bold;">🔥 Card matches multiple melds! Select the cards you want.</div>`;
    }
}

function findMatches(hand, card) {
    const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const matches = [];

    // Sets
    const sameRankIndices = hand.map((c, i) => c.rank === card.rank ? i : -1).filter(i => i !== -1);
    if (sameRankIndices.length >= 2) matches.push(sameRankIndices);

    // Runs
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

function updatePlayerSlot(slotId, player, isActive) {
    const slot = document.getElementById(slotId);
    if (!player) {
        slot.classList.add('hidden');
        return;
    }
    slot.classList.remove('hidden');

    if (isActive) {
        slot.classList.add('active-turn');
    } else {
        slot.classList.remove('active-turn');
    }

    const nameEl = slot.querySelector('.name') || document.getElementById('my-name');
    const chipsEl = slot.querySelector('.chips') || document.getElementById('my-chips');

    if (nameEl) nameEl.innerText = player.name;
    if (chipsEl) chipsEl.innerText = `$${player.chips.toLocaleString()}`;

    // Hand Mini
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

    // Exposed Melds Rendering
    const exposedContainer = slot.querySelector('.exposed-melds');
    if (exposedContainer) {
        exposedContainer.innerHTML = '';
        player.exposedMelds.forEach((meld, meldIndex) => {
            const groupEl = document.createElement('div');
            groupEl.className = 'meld-group';

            // Add click listener for Sapaw
            groupEl.addEventListener('click', () => {
                if (selectedCards.size === 1 && currentGameState.phase === 'action' && currentGameState.players[currentGameState.turnIndex].id === myId) {
                    const localIdx = Array.from(selectedCards)[0];
                    const selectedCard = myCards[localIdx];
                    const serverMe = currentGameState.players.find(p => p.id === myId);
                    const serverIdx = serverMe.hand.findIndex(c => c && c.rank === selectedCard.rank && c.suit === selectedCard.suit);

                    if (serverIdx !== -1) {
                        socket.emit('sapaw', {
                            targetPlayerId: player.id,
                            meldIndex: meldIndex,
                            cardIndex: serverIdx
                        });
                        selectedCards.clear();
                        renderHand(myCards);
                    }
                }
            });

            meld.cards.forEach(card => {
                const cardEl = document.createElement('div');
                cardEl.className = `card-mini ${['♥', '♦'].includes(card.suit) ? 'red' : ''}`;
                cardEl.innerHTML = `<span class="rank">${card.rank}</span><span class="suit-main">${card.suit}</span>`;
                groupEl.appendChild(cardEl);
            });
            exposedContainer.appendChild(groupEl);
        });
    }
}

function createCardElement(card) {
    const cardEl = document.createElement('div');
    cardEl.className = `card ${['♥', '♦'].includes(card.suit) ? 'red' : ''}`;
    cardEl.innerHTML = `<span class="rank">${card.rank}</span><span class="suit-main">${card.suit}</span>`;
    return cardEl;
}

function applySort() {
    const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
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

function renderHand(cards) {
    myHand.innerHTML = '';

    cards.forEach((card, index) => {
        const cardEl = createCardElement(card);
        cardEl.dataset.index = index;
        cardEl.draggable = true;
        if (selectedCards.has(index)) cardEl.classList.add('selected');

        if (card.groupId) {
            const indicator = document.createElement('div');
            indicator.className = 'group-indicator';
            indicator.style.backgroundColor = groups[card.groupId].color;
            cardEl.appendChild(indicator);
        }

        cardEl.addEventListener('click', () => {
            // Quick-Expose Logic
            if (cardEl.classList.contains('match-highlight') && canDraw()) {
                const matchIndices = cardEl.dataset.matchIndices.split(',').map(Number);
                const serverMe = currentGameState.players.find(p => p.id === myId);
                const serverIndexes = mapLocalToSvrIdx(matchIndices, myCards, serverMe.hand);
                socket.emit('draw-discard', { meldIndexes: serverIndexes });
                selectedCards.clear();
                return;
            }

            if (selectedCards.has(index)) {
                selectedCards.delete(index);
                cardEl.classList.remove('selected');
            } else {
                selectedCards.add(index);
                cardEl.classList.add('selected');
            }
            updateActionButtons();
        });

        cardEl.addEventListener('dragstart', (e) => {
            cardEl.classList.add('dragging');
            if (selectedCards.has(index)) {
                e.dataTransfer.setData('text/plain', 'group');
            } else {
                e.dataTransfer.setData('text/plain', index);
            }
        });
        cardEl.addEventListener('dragend', () => cardEl.classList.remove('dragging'));
        cardEl.addEventListener('dragover', (e) => e.preventDefault());
        cardEl.addEventListener('drop', (e) => {
            e.preventDefault();
            const data = e.dataTransfer.getData('text/plain');
            if (data === 'group') return;

            const fromIndex = parseInt(data);
            const toIndex = index;
            if (fromIndex !== toIndex) {
                const movedCard = myCards.splice(fromIndex, 1)[0];
                myCards.splice(toIndex, 0, movedCard);
                renderHand(myCards);
            }
        });
        myHand.appendChild(cardEl);
    });
}

// Game Over Visuals
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
        location.reload(); // Quick reset
    });

    return overlay;
}

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
            <span>${p.name} ${p.isWinner ? '🏆' : ''}</span>
            <span>${p.weight} pts</span>
        `;
        list.appendChild(row);
    });
}

function updateActionButtons() {
    const myTurn = currentGameState && currentGameState.players[currentGameState.turnIndex].id === myId;
    discardBtn.disabled = !myTurn || currentGameState.phase !== 'action' || selectedCards.size !== 1;
    exposeBtn.disabled = !myTurn || currentGameState.phase !== 'action' || selectedCards.size < 3;
}
