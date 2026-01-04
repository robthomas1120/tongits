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
        /**
         * AGGRESSIVE HARD BOT STRATEGY:
         * - Full knowledge of all cards (opponent hands, draw pile, discard pile)
         * - Exposes melds immediately (greedy approach)
         * - Calls fight when eligible and has lowest points
         * - Prioritizes discarding high-value cards that don't contribute to melds
         * - Takes discard pile cards aggressively if they complete melds
         */

        if (gameState.phase === 'draw') {
            // Always pick up discard if it forms a meld (aggressive)
            const canDrawDiscard = this.canDrawDiscard(player, gameState.discardPile);
            return canDrawDiscard ? 'draw-discard' : 'draw-stock';
        }

        if (gameState.phase === 'action') {
            // PRIORITY 1: Check if we can call FIGHT and win
            if (player.hasOpened && !player.openedThisTurn) {
                // Check if any of our melds are still sapawable (not fully claimed by others)
                const anySapawable = player.exposedMelds.some(m => !m.isSapawedByOthers);
                if (anySapawable) {
                    // Calculate our points vs opponents
                    const myWeight = this.calculateHandWeight(player.hand);
                    let canWinFight = true;

                    // Check opponent hands (hard bot has knowledge of all hands)
                    for (const otherPlayer of gameState.players) {
                        if (otherPlayer.id === player.id) continue;
                        const theirWeight = this.calculateHandWeight(otherPlayer.hand || []);
                        if (theirWeight <= myWeight) {
                            canWinFight = false;
                            break;
                        }
                    }

                    // If we have lowest points, FIGHT!
                    if (canWinFight && myWeight <= 15) {
                        return { action: 'fight' };
                    }
                }
            }

            // PRIORITY 2: Expose ALL melds immediately (greedy/aggressive)
            const possibleMelds = GameUtils.findPossibleMelds(player.hand);
            if (possibleMelds.length > 0) {
                // Find the largest meld (expose biggest first for maximum point reduction)
                let bestMeld = possibleMelds[0];
                for (const meld of possibleMelds) {
                    if (this.meldWeight(meld) > this.meldWeight(bestMeld)) {
                        bestMeld = meld;
                    }
                }
                const meldIndices = this.getIndicesForMeld(player.hand, bestMeld);
                return { action: 'expose', cardIndexes: meldIndices };
            }

            // PRIORITY 3: Sapaw to get rid of cards (reduces our points, blocks opponent melds)
            for (const otherPlayer of gameState.players) {
                for (let mIdx = 0; mIdx < otherPlayer.exposedMelds.length; mIdx++) {
                    const meld = otherPlayer.exposedMelds[mIdx];
                    // Find the highest value card we can lay off
                    let bestSapawIdx = -1;
                    let bestSapawValue = 0;
                    for (let cIdx = 0; cIdx < player.hand.length; cIdx++) {
                        if (GameUtils.canLayOff(player.hand[cIdx], meld.cards)) {
                            const cardValue = this.cardValue(player.hand[cIdx]);
                            if (cardValue > bestSapawValue) {
                                bestSapawValue = cardValue;
                                bestSapawIdx = cIdx;
                            }
                        }
                    }
                    if (bestSapawIdx >= 0) {
                        return { action: 'sapaw', targetPlayerId: otherPlayer.id, meldIndex: mIdx, cardIndex: bestSapawIdx };
                    }
                }
            }

            // PRIORITY 4: Discard the highest-value card that doesn't contribute to potential melds
            const discardIdx = this.findAggressiveDiscard(player.hand);
            return { action: 'discard', cardIndex: discardIdx };
        }
    }

    /**
     * Calculate total weight of a hand
     */
    static calculateHandWeight(hand) {
        const RANK_VALUES = {
            'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
            '8': 8, '9': 9, '10': 10, 'J': 10, 'Q': 10, 'K': 10
        };
        return (hand || []).reduce((sum, card) => sum + (RANK_VALUES[card.rank] || 0), 0);
    }

    /**
     * Get the point value of a single card
     */
    static cardValue(card) {
        const RANK_VALUES = {
            'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
            '8': 8, '9': 9, '10': 10, 'J': 10, 'Q': 10, 'K': 10
        };
        return RANK_VALUES[card.rank] || 0;
    }

    /**
     * Calculate total weight of a meld
     */
    static meldWeight(meld) {
        return meld.reduce((sum, card) => sum + this.cardValue(card), 0);
    }

    /**
     * Aggressive discard: prioritize high-value cards that don't help form melds
     */
    static findAggressiveDiscard(hand) {
        const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        let bestIdx = 0;
        let bestScore = -1000; // Higher score = better to discard

        hand.forEach((card, idx) => {
            const cardVal = this.cardValue(card);
            const rIdx = RANKS.indexOf(card.rank);

            // Check how many neighbors in same suit (potential run)
            const runNeighbors = hand.filter(c => c.suit === card.suit && Math.abs(RANKS.indexOf(c.rank) - rIdx) <= 2 && c !== card);

            // Check same rank (potential set)
            const setNeighbors = hand.filter(c => c.rank === card.rank && c !== card);

            // Score: high value cards with no neighbors are best to discard
            let score = cardVal * 3; // Base score is card value (prefer discarding high cards)
            score -= runNeighbors.length * 15; // Penalize if part of potential run
            score -= setNeighbors.length * 15; // Penalize if part of potential set

            if (score > bestScore) {
                bestScore = score;
                bestIdx = idx;
            }
        });

        return bestIdx;
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
