const
    authHandlers = require('./auth'),
    userHandlers = require('./user'),
    infoHandlers = require('./info'),
    storeHandlers = require('./store'),
    walletHandlers = require('./wallet'),
    friendHandlers = require('./friend'),
    gameHandlers = require('./game');

module.exports = {
    auth: authHandlers,
    user: userHandlers,
    info: infoHandlers,
    store: storeHandlers,
    wallet: walletHandlers,
    friend: friendHandlers,
    game: gameHandlers,
};
