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

const game = new GameSession();

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join-lobby', (data) => {
        console.log(`Player joining: ${data.name} (${socket.id})`);
        const player = game.addPlayer(socket.id, data.name, 'human');
        if (player) {
            console.log(`Player added. Current count: ${game.players.length}`);
            io.emit('lobby-update', { players: game.players });
            socket.emit('join-success', { playerId: socket.id });
        } else {
            console.log(`Player join failed (full).`);
            socket.emit('join-fail', { message: 'Lobby full' });
        }
    });

    socket.on('add-bot', (data) => {
        console.log(`Adding ${data.difficulty} bot.`);
        const botId = `bot-${Math.random().toString(36).substr(2, 9)}`;
        const bot = game.addPlayer(botId, `Bot ${data.difficulty}`, 'bot', data.difficulty);
        if (bot) {
            console.log(`Bot added. Current count: ${game.players.length}`);
            io.emit('lobby-update', { players: game.players });
        }
    });

    socket.on('remove-player', (id) => {
        game.players = game.players.filter(p => p.id !== id);
        io.emit('lobby-update', { players: game.players });
    });

    socket.on('start-game', () => {
        console.log(`Start game requested. Players: ${game.players.length}`);
        if (game.players.length === 3) {
            game.startRound();
            console.log("Round started. Sending game-started to players.");
            game.players.forEach(p => {
                io.to(p.id).emit('game-started', { gameState: serializeGameState(game, p.id) });
            });

            // Check if first turn is a bot
            setTimeout(() => checkBotTurn(), 1500);
        } else {
            console.log("Cannot start: need exactly 3 players.");
        }
    });

    socket.on('draw-stock', () => {
        if (game.drawFromStock(socket.id)) {
            broadcastUpdate();
        }
    });

    socket.on('draw-discard', (data) => {
        if (game.drawFromDiscard(socket.id, data.meldIndexes || [])) {
            broadcastUpdate();
        }
    });

    socket.on('discard', (data) => {
        if (game.discard(socket.id, data.cardIndex)) {
            broadcastUpdate();
        }
    });

    socket.on('expose-meld', (data) => {
        if (game.exposeMeld(socket.id, data.cardIndexes)) {
            broadcastUpdate();
        }
    });

    socket.on('sapaw', (data) => {
        if (game.sapaw(socket.id, data.targetPlayerId, data.meldIndex, data.cardIndex)) {
            broadcastUpdate();
        }
    });

    socket.on('call-fight', () => {
        if (game.callFight(socket.id)) {
            broadcastUpdate();
        }
    });

    function broadcastUpdate() {
        game.players.forEach(p => {
            io.to(p.id).emit('game-update', { gameState: serializeGameState(game, p.id) });
        });

        // Wait and check if next turn is a bot
        setTimeout(() => checkBotTurn(), 1500);
    }

    async function checkBotTurn() {
        if (game.status !== 'playing') return;

        const currentPlayer = game.getCurrentPlayer();
        if (!currentPlayer || currentPlayer.type !== 'bot') return;

        console.log(`Bot's turn: ${currentPlayer.name} (${game.phase})`);

        const botState = serializeGameState(game, currentPlayer.id);
        const decision = BotAI.getAction(currentPlayer, botState);

        if (game.phase === 'draw') {
            if (decision === 'draw-discard') {
                const topCard = game.discardPile[game.discardPile.length - 1];
                const melds = GameUtils.findPossibleMelds([...currentPlayer.hand, topCard]);
                const bestMeld = melds.find(m => {
                    // Primitive check: meld contains the topCard (rank or suit match)
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
            broadcastUpdate();
        } else if (game.phase === 'action' && decision) {
            if (decision.action === 'expose') {
                game.exposeMeld(currentPlayer.id, decision.cardIndexes);
                broadcastUpdate();
            } else if (decision.action === 'sapaw') {
                game.sapaw(currentPlayer.id, decision.targetPlayerId, decision.meldIndex, decision.cardIndex);
                broadcastUpdate();
            } else if (decision.action === 'discard') {
                game.discard(currentPlayer.id, decision.cardIndex);
                broadcastUpdate();
            }
        }
    }

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const playerIndex = game.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
            const player = game.players[playerIndex];
            game.players.splice(playerIndex, 1);
            console.log(`Player ${player.name} removed. Count: ${game.players.length}`);

            // If game was playing, we might want to abort or just notify
            if (game.status === 'playing') {
                game.addLog(`${player.name} disconnected.`);
                io.emit('game-update', { gameState: serializeGameState(game, null) });
            }
            io.emit('lobby-update', { players: game.players });
        }

        // If no humans left, hard reset
        const humanCount = game.players.filter(p => p.type === 'human').length;
        if (humanCount === 0) {
            console.log("No human players left. Resetting game session.");
            game.reset();
            game.date = new Date(); // Force refresh if needed
            io.emit('lobby-update', { players: [] });
            // Also emit a reset event so any lingering clients know
            io.emit('game-reset');
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
            hand: p.id === forPlayerId ? p.hand : [], // Only send hand to owner
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
