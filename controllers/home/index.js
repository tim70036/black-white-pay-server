
// Import hadnlers from each sub module
const
    dashboardHandlers = require('./dashboard'),
    personnelHandlers = require('./personnel'),
    storeCurrencyHandlers = require('./storeCurrency'),
    mainCurrencyHandlers = require('./mainCurrency'),
    reportHandlers = require('./report'),
    infoHandlers = require('./info'),
    accountHandlers = require('./account'),
    detailHandlers = require('./detail'),
    authHandlers = require('./auth'),
    gameHandlers = require('./game');

// Handler for login page
let loginHandler = function (req, res) {

    // User has already logined, just redirect
    // console.log(req.user);
    if (req.isAuthenticated()) {
        return res.redirect(303, '/');
    }

    return res.render('home/login', { layout: false });
};

module.exports = {
    dashboard: dashboardHandlers,
    login: loginHandler,
    auth: authHandlers,

    personnel: personnelHandlers,
    storeCurrency: storeCurrencyHandlers,
    mainCurrency: mainCurrencyHandlers,
    report: reportHandlers,
    info: infoHandlers,
    account: accountHandlers,
    detail: detailHandlers,
    game: gameHandlers,
};

// ----------------------------------------------------- //
