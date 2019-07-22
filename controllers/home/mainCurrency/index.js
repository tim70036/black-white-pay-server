const
	transfer = require('./transfer'),
	history = require('./history'),
	exchange = require('./exchange'),
	exchangeHistory = require('./exchangeHistory');

module.exports = {
	mainTransfer : transfer,
	mainHistory : history,
	exchange : exchange,
	exchangeHistory : exchangeHistory,
};