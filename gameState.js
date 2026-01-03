/**
 * Tongits Game State Manager
 * Handles players, turns, and round progression.
 */
const { Deck, GameUtils } = require('./gameEngine');

class Player {
    constructor(id, name, type = 'human', difficulty = 'medium') {
        this.id = id;
        this.name = name;
        this.type = type; // 'human' or 'bot'
        this.difficulty = difficulty;
        this.hand = [];
        this.exposedMelds = [];
        this.chips = 100;
        this.hasOpened = false;
        this.isBurned = false;
        this.lastAction = '';
        this.consecutiveWins = 0;
    }
}

class GameSession {
    constructor() {
        this.players = [];
        this.deck = new Deck();
        this.discardPile = [];
        this.turnIndex = 0;
        this.dealerIndex = 0;
        this.status = 'lobby'; // lobby, playing, ended
        this.sidePot = 0;
        this.winnerOfPreviousHand = null;
        this.logs = [];
    }

    addPlayer(id, name, type, difficulty) {
        if (this.players.length < 3) {
            const player = new Player(id, name, type, difficulty);
            this.players.push(player);
            return player;
        }
        return null;
    }

    startRound() {
        if (this.players.length < 3) return false;

        this.status = 'playing';
        this.deck = new Deck();
        this.deck.shuffle();
        this.discardPile = [];
        this.logs = [];

        this.phase = 'draw'; // draw, action, discard

        // Initial bet to side pot
        this.players.forEach(p => {
            p.chips -= 2;
            this.sidePot += 2;
            p.hand = [];
            p.exposedMelds = [];
            p.hasOpened = false;
            p.isBurned = false;
        });

        // Determine dealer (rotating or winner)
        if (this.winnerOfPreviousHand !== null) {
            this.dealerIndex = this.players.findIndex(p => p.id === this.winnerOfPreviousHand);
        } else {
            this.dealerIndex = Math.floor(Math.random() * 3);
        }

        // Deal: 13 to dealer, 12 to others
        for (let i = 0; i < 12; i++) {
            this.players.forEach(p => p.hand.push(this.deck.draw()));
        }
        this.players[this.dealerIndex].hand.push(this.deck.draw());

        this.turnIndex = this.dealerIndex;
        this.phase = 'action'; // Dealer starts in action phase (has 13 cards)
        this.addLog(`${this.players[this.dealerIndex].name} is the dealer and starts the action.`);
        return true;
    }

    drawFromStock(playerId) {
        if (this.status !== 'playing' || this.phase !== 'draw') return false;
        const player = this.getCurrentPlayer();
        if (player.id !== playerId) return false;

        const card = this.deck.draw();
        if (card) {
            player.hand.push(card);
            this.phase = 'action';
            this.addLog(`${player.name} drew from stock.`);
            return true;
        }
        return false;
    }

    drawFromDiscard(playerId, cardsToMeltIndexes) {
        if (this.status !== 'playing' || this.phase !== 'draw' || this.discardPile.length === 0) return false;
        const player = this.getCurrentPlayer();
        if (player.id !== playerId) return false;

        const topCard = this.discardPile.pop();
        const handCardsForMeld = cardsToMeltIndexes.map(i => player.hand[i]);
        const potentialMeld = [...handCardsForMeld, topCard];

        if (GameUtils.isSet(potentialMeld) || GameUtils.isRun(potentialMeld)) {
            // Remove cards from hand
            player.hand = player.hand.filter((_, i) => !cardsToMeltIndexes.includes(i));
            player.exposedMelds.push({ cards: potentialMeld, isSecret: false });
            player.hasOpened = true;
            this.phase = 'action';
            this.addLog(`${player.name} drew from discard and exposed a meld.`);
            return true;
        } else {
            this.discardPile.push(topCard); // Put it back
            return false;
        }
    }

    discard(playerId, cardIndex) {
        if (this.status !== 'playing' || this.phase !== 'action') return false;
        const player = this.getCurrentPlayer();
        if (player.id !== playerId) return false;

        const card = player.hand.splice(cardIndex, 1)[0];
        this.discardPile.push(card);
        this.addLog(`${player.name} discarded ${card.rank}${card.suit}.`);

        if (player.hand.length === 0) {
            this.endRound(player, 'tongit');
        } else {
            this.nextTurn();
            this.phase = 'draw';
        }
        return true;
    }

    exposeMeld(playerId, cardIndexes) {
        if (this.status !== 'playing' || this.phase !== 'action') return false;
        const player = this.getCurrentPlayer();
        if (player.id !== playerId) return false;

        const meldCards = cardIndexes.map(i => player.hand[i]);
        if (GameUtils.isSet(meldCards) || GameUtils.isRun(meldCards)) {
            // Remove from hand (sort indexes descending to avoid shift issues)
            [...cardIndexes].sort((a, b) => b - a).forEach(i => player.hand.splice(i, 1));
            player.exposedMelds.push({ cards: meldCards, isSecret: false });
            player.hasOpened = true;
            this.addLog(`${player.name} exposed a meld.`);
            return true;
        }
        return false;
    }

    endRound(winner, type) {
        this.status = 'ended';
        this.winnerOfPreviousHand = winner.id;
        // Scoring logic would go here
        this.addLog(`Game ended! ${winner.name} wins by ${type}.`);
    }

    addLog(msg) {
        this.logs.push({ time: new Date().toLocaleTimeString(), message: msg });
        if (this.logs.length > 50) this.logs.shift();
    }

    getCurrentPlayer() {
        return this.players[this.turnIndex];
    }

    nextTurn() {
        this.turnIndex = (this.turnIndex + 1) % 3;
    }
}

module.exports = { GameSession, Player };
