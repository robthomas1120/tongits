const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const { GameSession } = require('./gameState');

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
            // Send personalized game state to each player (so they only see their own hand)
            game.players.forEach(p => {
                io.to(p.id).emit('game-started', { gameState: serializeGameState(game, p.id) });
            });
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

    function broadcastUpdate() {
        game.players.forEach(p => {
            io.to(p.id).emit('game-update', { gameState: serializeGameState(game, p.id) });
        });
    }

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const playerIndex = game.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
            const player = game.players[playerIndex];
            if (game.status === 'lobby') {
                game.players.splice(playerIndex, 1);
                console.log(`Player ${player.name} removed from lobby. Count: ${game.players.length}`);
                io.emit('lobby-update', { players: game.players });
            } else {
                console.log(`Player ${player.name} disconnected during game.`);
                // In a real game, we might wait for reconnect or end game
                // For now, let's just log it.
            }
        }

        // If all humans gone, reset game
        const humanCount = game.players.filter(p => p.type === 'human').length;
        if (humanCount === 0) {
            console.log("No human players left. Resetting game session.");
            game.players = [];
            game.status = 'lobby';
            io.emit('lobby-update', { players: [] });
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
            isBurned: p.isBurned
        })),
        discardPile: game.discardPile,
        turnIndex: game.turnIndex,
        phase: game.phase,
        dealerIndex: game.dealerIndex,
        stockCount: game.deck.count,
        sidePot: game.sidePot,
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
