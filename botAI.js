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
        if (gameState.phase === 'draw') {
            const canDrawDiscard = this.canDrawDiscard(player, gameState.discardPile);
            // Easy bot rarely picks up discard unless prompted (random 30%)
            return (Math.random() < 0.3 && canDrawDiscard) ? 'draw-discard' : 'draw-stock';
        }

        if (gameState.phase === 'action') {
            // 1. Look for Sapaw opportunities
            for (const otherPlayer of gameState.players) {
                for (let mIdx = 0; mIdx < otherPlayer.exposedMelds.length; mIdx++) {
                    const meld = otherPlayer.exposedMelds[mIdx];
                    for (let cIdx = 0; cIdx < player.hand.length; cIdx++) {
                        if (GameUtils.canLayOff(player.hand[cIdx], meld.cards)) {
                            return { action: 'sapaw', targetPlayerId: otherPlayer.id, meldIndex: mIdx, cardIndex: cIdx };
                        }
                    }
                }
            }

            // Easy bot discards randomly
            const discardIdx = Math.floor(Math.random() * player.hand.length);
            return { action: 'discard', cardIndex: discardIdx };
        }
    }

    static mediumLogic(player, gameState) {
        if (gameState.phase === 'draw') {
            const canDrawDiscard = this.canDrawDiscard(player, gameState.discardPile);
            // Medium bot always picks up discard if it forms a meld
            return canDrawDiscard ? 'draw-discard' : 'draw-stock';
        }

        if (gameState.phase === 'action') {
            // 1. Look for Sapaw opportunities
            for (const otherPlayer of gameState.players) {
                for (let mIdx = 0; mIdx < otherPlayer.exposedMelds.length; mIdx++) {
                    const meld = otherPlayer.exposedMelds[mIdx];
                    for (let cIdx = 0; cIdx < player.hand.length; cIdx++) {
                        if (GameUtils.canLayOff(player.hand[cIdx], meld.cards)) {
                            return { action: 'sapaw', targetPlayerId: otherPlayer.id, meldIndex: mIdx, cardIndex: cIdx };
                        }
                    }
                }
            }

            // 2. Look for melds in hand and expose them (Medium bot exposes all if it helps)
            const possibleMelds = GameUtils.findPossibleMelds(player.hand);
            if (possibleMelds.length > 0) {
                const meldIndices = this.getIndicesForMeld(player.hand, possibleMelds[0]);
                return { action: 'expose', cardIndexes: meldIndices };
            }

            // 2. Otherwise discard the least useful card
            const discardIdx = this.findBestDiscard(player.hand);
            return { action: 'discard', cardIndex: discardIdx };
        }
    }

    static hardLogic(player, gameState) {
        // Hard logic is similar to medium but more strategic about exposing and discarding
        return this.mediumLogic(player, gameState);
    }

    static findBestDiscard(hand) {
        // Very basic: discard a card that is not part of any near-meld
        const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        let bestIdx = 0;
        let minScore = 1000;

        hand.forEach((card, idx) => {
            let score = 0;
            const rIdx = RANKS.indexOf(card.rank);

            // Check neighbors in same suit
            const neighbors = hand.filter(c => c.suit === card.suit && Math.abs(RANKS.indexOf(c.rank) - rIdx) <= 2);
            score += neighbors.length * 10;

            // Check same rank
            const sameRank = hand.filter(c => c.rank === card.rank);
            score += sameRank.length * 10;

            if (score < minScore) {
                minScore = score;
                bestIdx = idx;
            }
        });

        return bestIdx;
    }

    static getIndicesForMeld(hand, meldCards) {
        const indices = [];
        const tempHand = [...hand];
        meldCards.forEach(mc => {
            const idx = tempHand.findIndex(hc => hc && hc.rank === mc.rank && hc.suit === mc.suit);
            if (idx !== -1) {
                indices.push(idx);
                tempHand[idx] = null;
            }
        });
        return indices;
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
