const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const { GameSession } = require('./gameState');
const { GameUtils } = require('./gameEngine');
const BotAI = require('./botAI');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 8888;

app.use((req, res, next) => {
    console.log(`${new Date().toLocaleTimeString()} - ${req.method} ${req.url}`);
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Multi-Lobby Manager
const lobbies = new Map(); // roomId -> GameSession

function getGame(roomId) {
    if (!lobbies.has(roomId)) {
        lobbies.set(roomId, new GameSession());
        console.log(`Created new lobby: ${roomId}`);
    }
    return lobbies.get(roomId);
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Initial connection doesn't join a room yet
    // Client must emit 'join-room' first

    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        socket.data.roomId = roomId;
        const game = getGame(roomId);
        console.log(`Socket ${socket.id} joined room ${roomId}`);

        // Send current state immediately (even if empty)
        socket.emit('lobby-update', { players: game.players });
    });

    socket.on('join-lobby', (data) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;

        const game = getGame(roomId);
        console.log(`Player joining room ${roomId}: ${data.name} (${socket.id})`);

        const player = game.addPlayer(socket.id, data.name, 'human');
        if (player) {
            console.log(`Player added to ${roomId}. Current count: ${game.players.length}`);
            io.to(roomId).emit('lobby-update', { players: game.players });
            socket.emit('join-success', { playerId: socket.id });
        } else {
            console.log(`Player join failed (full) in ${roomId}.`);
            socket.emit('join-fail', { message: 'Lobby full' });
        }
    });

    socket.on('add-bot', (data) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const game = getGame(roomId);

        console.log(`Adding ${data.difficulty} bot to ${roomId}.`);
        const botId = `bot-${Math.random().toString(36).substr(2, 9)}`;
        const bot = game.addPlayer(botId, `Bot ${data.difficulty}`, 'bot', data.difficulty);
        if (bot) {
            console.log(`Bot added. Current count: ${game.players.length}`);
            io.to(roomId).emit('lobby-update', { players: game.players });
        }
    });

    socket.on('remove-player', (id) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const game = getGame(roomId);

        game.players = game.players.filter(p => p.id !== id);
        io.to(roomId).emit('lobby-update', { players: game.players });
    });

    socket.on('start-game', () => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const game = getGame(roomId);

        console.log(`Start game requested for ${roomId}. Players: ${game.players.length}`);
        if (game.players.length === 3) {
            game.startRound();
            console.log("Round started. Sending game-started to players.");
            game.players.forEach(p => {
                io.to(p.id).emit('game-started', { gameState: serializeGameState(game, p.id) });
            });

            // Check if first turn is a bot
            setTimeout(() => checkBotTurn(roomId), 1500);
        } else {
            console.log("Cannot start: need exactly 3 players.");
        }
    });

    socket.on('draw-stock', () => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const game = getGame(roomId);
        if (game.drawFromStock(socket.id)) {
            broadcastUpdate(roomId);
        }
    });

    socket.on('draw-discard', (data) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const game = getGame(roomId);
        if (game.drawFromDiscard(socket.id, data.meldIndexes || [])) {
            broadcastUpdate(roomId);
        }
    });

    socket.on('discard', (data) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const game = getGame(roomId);
        if (game.discard(socket.id, data.cardIndex)) {
            broadcastUpdate(roomId);
        }
    });

    socket.on('expose-meld', (data) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const game = getGame(roomId);
        if (game.exposeMeld(socket.id, data.cardIndexes)) {
            broadcastUpdate(roomId);
        }
    });

    socket.on('sapaw', (data) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const game = getGame(roomId);
        if (game.sapaw(socket.id, data.targetPlayerId, data.meldIndex, data.cardIndex)) {
            broadcastUpdate(roomId);
        }
    });

    socket.on('call-fight', () => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const game = getGame(roomId);
        if (game.callFight(socket.id)) {
            broadcastUpdate(roomId);
        }
    });

    function broadcastUpdate(roomId) {
        const game = getGame(roomId);
        game.players.forEach(p => {
            io.to(p.id).emit('game-update', { gameState: serializeGameState(game, p.id) });
        });

        // Wait and check if next turn is a bot
        setTimeout(() => checkBotTurn(roomId), 1500);
    }

    async function checkBotTurn(roomId) {
        const game = getGame(roomId);
        if (game.status !== 'playing') return;

        const currentPlayer = game.getCurrentPlayer();
        if (!currentPlayer || currentPlayer.type !== 'bot') return;

        console.log(`Bot's turn in ${roomId}: ${currentPlayer.name} (${game.phase})`);

        // Hard bots get full game knowledge (all hands visible)
        const botState = currentPlayer.difficulty === 'hard'
            ? serializeGameStateForHardBot(game, currentPlayer.id)
            : serializeGameState(game, currentPlayer.id);
        const decision = BotAI.getAction(currentPlayer, botState);

        if (game.phase === 'draw') {
            if (decision === 'draw-discard') {
                const topCard = game.discardPile[game.discardPile.length - 1];
                const melds = GameUtils.findPossibleMelds([...currentPlayer.hand, topCard]);
                const bestMeld = melds.find(m => {
                    return m.some(c => c.rank === topCard.rank && c.suit === topCard.suit);
                });

                if (bestMeld) {
                    const handIndices = BotAI.getIndicesForMeld(currentPlayer.hand, bestMeld.filter(c => c.rank !== topCard.rank || c.suit !== topCard.suit));
                    game.drawFromDiscard(currentPlayer.id, handIndices);
                } else {
                    game.drawFromStock(currentPlayer.id);
                }
            } else {
                game.drawFromStock(currentPlayer.id);
            }
            broadcastUpdate(roomId);
        } else if (game.phase === 'action' && decision) {
            if (decision.action === 'fight') {
                // Hard bot calls fight
                if (game.callFight(currentPlayer.id)) {
                    console.log(`Bot ${currentPlayer.name} called FIGHT!`);
                    broadcastUpdate(roomId);
                }
            } else if (decision.action === 'expose') {
                game.exposeMeld(currentPlayer.id, decision.cardIndexes);
                broadcastUpdate(roomId);
            } else if (decision.action === 'sapaw') {
                game.sapaw(currentPlayer.id, decision.targetPlayerId, decision.meldIndex, decision.cardIndex);
                broadcastUpdate(roomId);
            } else if (decision.action === 'discard') {
                game.discard(currentPlayer.id, decision.cardIndex);
                broadcastUpdate(roomId);
            }
        }
    }

    socket.on('disconnect', () => {
        const roomId = socket.data.roomId;
        if (!roomId) return;

        console.log('User disconnected from', roomId, socket.id);
        const game = getGame(roomId);

        const playerIndex = game.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
            const player = game.players[playerIndex];
            game.players.splice(playerIndex, 1);
            console.log(`Player ${player.name} removed from ${roomId}. Count: ${game.players.length}`);

            if (game.status === 'playing') {
                game.addLog(`${player.name} disconnected.`);
                io.to(roomId).emit('game-update', { gameState: serializeGameState(game, null) });
            }
            io.to(roomId).emit('lobby-update', { players: game.players });
        }

        const humanCount = game.players.filter(p => p.type === 'human').length;
        if (humanCount === 0) {
            console.log(`No human players left in ${roomId}. Resetting game session.`);
            game.reset();
            game.date = new Date();
            io.to(roomId).emit('lobby-update', { players: [] });
            io.to(roomId).emit('game-reset');

            // Clean up empty lobbies after a while? 
            // For now, persistent in memory until server restarts or explicitly deleted
            if (game.players.length === 0) {
                // lobbies.delete(roomId); // Maybe later
            }
        }
    });
});

function serializeGameState(game, forPlayerId) {
    return {
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            type: p.type,
            handCount: p.hand.length,
            hand: (p.id === forPlayerId || game.status === 'ended') ? p.hand : [], // Send hand to owner OR if game ended
            exposedMelds: p.exposedMelds,
            chips: p.chips,
            hasOpened: p.hasOpened,
            openedThisTurn: p.openedThisTurn,
            isBurned: p.isBurned
        })),
        discardPile: game.discardPile,
        turnIndex: game.turnIndex,
        phase: game.phase,
        dealerIndex: game.dealerIndex,
        stockCount: game.deck.count,
        sidePot: game.sidePot,
        status: game.status,
        roundResults: game.roundResults,
        logs: game.logs
    };
}

/**
 * Serialize game state for hard bots - they see ALL hands
 */
function serializeGameStateForHardBot(game, forPlayerId) {
    return {
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            type: p.type,
            difficulty: p.difficulty,
            handCount: p.hand.length,
            hand: p.hand, // Hard bot sees ALL hands
            exposedMelds: p.exposedMelds,
            chips: p.chips,
            hasOpened: p.hasOpened,
            openedThisTurn: p.openedThisTurn,
            isBurned: p.isBurned
        })),
        discardPile: game.discardPile,
        turnIndex: game.turnIndex,
        phase: game.phase,
        dealerIndex: game.dealerIndex,
        stockCount: game.deck.count,
        sidePot: game.sidePot,
        status: game.status,
        roundResults: game.roundResults,
        logs: game.logs
    };
}

function getLocalIPAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

server.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIPAddress();
    console.log(`Server running on:`);
    console.log(`- Local:   http://localhost:${PORT}`);
    console.log(`- Network: http://${localIP}:${PORT}`);
    console.log(`\nShare the Network URL with players to join!`);
});
