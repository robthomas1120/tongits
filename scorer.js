/**
 * Tongits Scorer
 * Calculates final scores and chip exchanges.
 */
class Scorer {
    static calculateChips(winner, losers, endType, sidePotClaimed) {
        let results = [];
        let winnerTotal = 0;

        losers.forEach(loser => {
            let payment = 1; // Baseline
            if (endType === 'tongit' || endType === 'challenged-draw') {
                payment = 3;
            }

            // Ace bonus (only in winner's hand or exposed melds)
            const winnerAces = this.countAces(winner);
            payment += winnerAces;

            // Secret set bonus
            const secretSets = winner.exposedMelds.filter(m => m.isSecret).length;
            payment += secretSets * 3;

            // Burned penalty
            if (loser.isBurned || !loser.hasOpened) {
                payment += 1;
            }

            results.push({
                from: loser.name,
                to: winner.name,
                amount: payment
            });
            winnerTotal += payment;
            loser.chips -= payment;
        });

        winner.chips += winnerTotal;
        if (sidePotClaimed) {
            winner.chips += sidePotClaimed;
        }

        return { exchanges: results, winnerTotal, sidePotClaimed };
    }

    static countAces(player) {
        let count = 0;
        player.hand.forEach(c => { if (c.rank === 'A') count++; });
        player.exposedMelds.forEach(meld => {
            meld.cards.forEach(c => { if (c.rank === 'A') count++; });
        });
        return count;
    }
}

module.exports = Scorer;
