/**
 * Unit tests for Tongits Game Logic
 */
const { Deck, GameUtils } = require('./gameEngine');
const { GameSession } = require('./gameState');

function testDeck() {
    console.log('--- Testing Deck ---');
    const deck = new Deck();
    console.log('Initial count:', deck.count); // Should be 52
    deck.shuffle();
    const card = deck.draw();
    console.log('Drawn card:', card.toString(), 'Remaining:', deck.count);
}

function testMeldValidation() {
    console.log('--- Testing Meld Validation ---');
    const { Card } = require('./gameEngine');

    const set = [
        new Card('♠', '7'),
        new Card('♥', '7'),
        new Card('♦', '7')
    ];
    console.log('Is Set (7s):', GameUtils.isSet(set)); // true

    const run = [
        new Card('♠', '4'),
        new Card('♠', '5'),
        new Card('♠', '6')
    ];
    console.log('Is Run (S 4-5-6):', GameUtils.isRun(run)); // true

    const invalidRun = [
        new Card('♠', 'Q'),
        new Card('♠', 'K'),
        new Card('♠', 'A')
    ];
    console.log('Is Run (Q-K-A - should be false):', GameUtils.isRun(invalidRun)); // false
}

function testGameSession() {
    console.log('--- Testing Game Session ---');
    const session = new GameSession();
    session.addPlayer('p1', 'Alice', 'human');
    session.addPlayer('p2', 'Bot1', 'bot', 'medium');
    session.addPlayer('p3', 'Bot2', 'bot', 'hard');

    console.log('Starting round...');
    session.startRound();
    console.log('Status:', session.status);
    console.log('Dealer:', session.players[session.dealerIndex].name);
    console.log('Player 1 hand size:', session.players[0].hand.length); // 12 or 13

    const currentPlayer = session.getCurrentPlayer();
    console.log('Current turn:', currentPlayer.name, 'Phase:', session.phase);

    // Test drawing
    session.drawFromStock(currentPlayer.id);
    console.log('After drawing, Phase:', session.phase, 'Hand size:', currentPlayer.hand.length);

    // Test discarding
    session.discard(currentPlayer.id, 0);
    console.log('After discarding, Phase:', session.phase, 'Discard count:', session.discardPile.length);
}

testDeck();
testMeldValidation();
testGameSession();
