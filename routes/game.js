// Export a router that is set with custom routes
// Import handlers for routes
const
    express = require('express');

let router = express.Router();

// Extract handlers
const { cq9 } = require('../controllers/game');

// Check auth
router.use(/^\/(cq9).*/, cq9.isAuthorized); 

// Register routes to a router
// CQ9 routes
router.get('/cq9/player/check/:userGameWalletId', cq9.checkPlayerValidate, cq9.checkPlayer);
router.get('/cq9/transaction/balance/:userGameWalletId', cq9.balanceValidate, cq9.balance);
router.get('/cq9/transaction/record/:mtcode', cq9.recordValidate, cq9.record);

router.post('/cq9/transaction/game/takeall', cq9.takeAllValidate, cq9.isValidMtcode, cq9.isValidSession, cq9.takeAll);
router.post('/cq9/transaction/game/bet', cq9.betValidate, cq9.isValidMtcode, cq9.isValidSession, cq9.bet);
router.post('/cq9/transaction/game/rollout', cq9.rollOutValidate, cq9.isValidMtcode, cq9.isValidSession, cq9.rollOut);

router.post('/cq9/transaction/game/rollin', cq9.rollInValidate, cq9.isValidMtcode, cq9.rollIn);
router.post('/cq9/transaction/game/endround', cq9.endRoundValidate, cq9.endRound); // Special case: mt code number > 1, just check the first one

router.post('/cq9/transaction/game/refund', cq9.refundValidate, cq9.refund);
router.post('/cq9/transaction/user/payoff', cq9.payOffValidate, cq9.isValidMtcode, cq9.payOff);

router.post('/cq9/transaction/game/debit', cq9.debitValidate, cq9.isValidMtcode, cq9.debit);
router.post('/cq9/transaction/game/credit', cq9.creditValidate, cq9.isValidMtcode, cq9.credit);

// Invalid routes
router.use(cq9.invalidRoute);

module.exports = router;
