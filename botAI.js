/**
 * Tongits Bot AI
 * Implements Easy, Medium, and Hard logic.
 */
const { GameUtils } = require('./gameEngine');

class BotAI {
    static getAction(player, gameState) {
        switch (player.difficulty) {
            case 'easy':
                return this.easyLogic(player, gameState);
            case 'medium':
                return this.mediumLogic(player, gameState);
            case 'hard':
                return this.hardLogic(player, gameState);
            default:
                return this.easyLogic(player, gameState);
        }
    }

    static easyLogic(player, gameState) {
        // Randomly pick an action
        const canDrawDiscard = this.canDrawDiscard(player, gameState.discardPile);
        if (gameState.phase === 'draw') {
            return Math.random() < 0.3 && canDrawDiscard ? 'draw-discard' : 'draw-stock';
        }
        if (gameState.phase === 'action') {
            return 'discard'; // Easy bot just discards randomly
        }
    }

    static mediumLogic(player, gameState) {
        if (gameState.phase === 'draw') {
            if (this.canDrawDiscard(player, gameState.discardPile)) {
                return 'draw-discard';
            }
            return 'draw-stock';
        }
        // ... more complex logic for melds and discards
        return 'discard';
    }

    static hardLogic(player, gameState) {
        // ... advanced predictive logic
        return 'discard';
    }

    static canDrawDiscard(player, discardPile) {
        if (discardPile.length === 0) return false;
        const topCard = discardPile[discardPile.length - 1];
        // Must form a NEW meld
        const melds = GameUtils.findPossibleMelds([...player.hand, topCard]);
        return melds.some(meld => meld.includes(topCard));
    }
}

module.exports = BotAI;
