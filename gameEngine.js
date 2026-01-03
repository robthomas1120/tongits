/**
 * Tongits Game Engine
 * Handles core game logic: deck, shuffling, dealing, meld validation, and scoring.
 */

const SUITS = ['♠', '♥', '♦', '♣']; // Spade, Heart, Diamond, Club
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_VALUES = {
    'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 10, 'Q': 10, 'K': 10
};

class Card {
    constructor(suit, rank) {
        this.suit = suit;
        this.rank = rank;
        this.value = RANK_VALUES[rank];
    }

    toString() {
        return `${this.rank}${this.suit}`;
    }

    // Ace is low (1)
    getRankIndex() {
        return RANKS.indexOf(this.rank);
    }
}

class Deck {
    constructor() {
        this.cards = [];
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                this.cards.push(new Card(suit, rank));
            }
        }
    }

    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    draw() {
        return this.cards.pop();
    }

    get count() {
        return this.cards.length;
    }
}

// Logic for finding/validating melds
const GameUtils = {
    /**
     * Checks if a group of cards is a valid Set (3-4 cards of same rank)
     */
    isSet(cards) {
        if (cards.length < 3 || cards.length > 4) return false;
        const rank = cards[0].rank;
        return cards.every(c => c.rank === rank);
    },

    /**
     * Checks if a group of cards is a valid Run (3+ consecutive cards of same suit)
     */
    isRun(cards) {
        if (cards.length < 3) return false;
        const suit = cards[0].suit;
        if (!cards.every(c => c.suit === suit)) return false;

        const sorted = [...cards].sort((a, b) => a.getRankIndex() - b.getRankIndex());
        for (let i = 0; i < sorted.length - 1; i++) {
            if (sorted[i + 1].getRankIndex() !== sorted[i].getRankIndex() + 1) {
                return false;
            }
        }
        return true;
    },

    /**
     * Finds all possible melds in a hand.
     * This is a simple greedy implementation; more complex versions would use recursion.
     */
    findPossibleMelds(cards) {
        const melds = [];
        const used = new Set();
        const sorted = [...cards].sort((a, b) => {
            if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
            return a.getRankIndex() - b.getRankIndex();
        });

        // Find Runs
        for (let i = 0; i < sorted.length; i++) {
            if (used.has(i)) continue;
            let run = [sorted[i]];
            for (let j = i + 1; j < sorted.length; j++) {
                if (used.has(j)) continue;
                const last = run[run.length - 1];
                if (sorted[j].suit === last.suit && sorted[j].getRankIndex() === last.getRankIndex() + 1) {
                    run.push(sorted[j]);
                }
            }
            if (run.length >= 3) {
                melds.push(run);
                run.forEach(c => used.add(sorted.indexOf(c)));
            }
        }

        // Find Sets (on remaining cards)
        const remaining = sorted.filter((_, i) => !used.has(i));
        const byRank = {};
        remaining.forEach(c => {
            if (!byRank[c.rank]) byRank[c.rank] = [];
            byRank[c.rank].push(c);
        });

        for (const rank in byRank) {
            if (byRank[rank].length >= 3) {
                melds.push(byRank[rank]);
            }
        }

        return melds;
    },

    /**
     * Calculates total value of unmelded cards
     */
    calculateHandValue(cards, exposedMelds = []) {
        // Find best melds in hand to minimize value
        // Note: Simple greedy approach for now
        const possibleMelds = this.findPossibleMelds(cards);
        const meldedCards = new Set();
        possibleMelds.forEach(meld => meld.forEach(c => meldedCards.add(c)));

        return cards.reduce((sum, card) => {
            if (meldedCards.has(card)) return sum;
            return sum + card.value;
        }, 0);
    },

    /**
     * Validates if a card can be laid off on an existing meld
     */
    canLayOff(card, meld) {
        if (this.isSet(meld)) {
            return meld.length < 4 && card.rank === meld[0].rank;
        } else if (this.isRun(meld)) {
            const sorted = [...meld].sort((a, b) => a.getRankIndex() - b.getRankIndex());
            const first = sorted[0];
            const last = sorted[sorted.length - 1];
            return card.suit === first.suit &&
                (card.getRankIndex() === first.getRankIndex() - 1 ||
                    card.getRankIndex() === last.getRankIndex() + 1);
        }
        return false;
    }
};

module.exports = {
    Card,
    Deck,
    GameUtils,
    SUITS,
    RANKS
};
