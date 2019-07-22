const
	mysql = require('mysql'),
	sqlAsync = require('../../../libs/sqlAsync'),
	// emoji = require('node-emoji'),
	{ body, validationResult } = require('express-validator/check'),
	{ sanitizeBody } = require('express-validator/filter');
	// moment = require('moment');

const transTypeOptions = [
	{
		// outflow
		code: 0,
		description: `店家幣轉聯盟幣`,
		class: `primary`,
	},
	{
		// inflow
		code: 1,
		description: `聯盟幣轉店家幣`,
		class: `danger`,
	},
];

let exchangeRenderHandler = async function (req, res) {

	// Generate transTypeOptions based on role
	let transTypeOptionsData = transTypeOptions;

	// Get storeCurrency
	let sqlString, values, results;
	sqlString = `	SELECT store.id, store.currencyName, U.name
					FROM StoreInfo AS store
					INNER JOIN AdminInfo AS Adm
						ON store.adminId = Adm.id
					INNER JOIN UserAccount AS U
						ON store.uid = U.id
					WHERE Adm.uid=?
				;`;
	values = [req.user.id];
	sqlString = mysql.format(sqlString, values);
	try{
		results = await sqlAsync.query(req.db, sqlString);
	}
	catch(error){
		req.logger.error(`${error.message}`);
		results = [];
	}

	return res.render('home/mainCurrency/exchange', { layout: 'home', transTypeOptions: transTypeOptionsData, transCurrency: results });
};

let exchangeFormHandler = async function (req, res) {

	const result = validationResult(req);

	// If the form data is invalid
	if (!result.isEmpty()) {
		// Return the first error to client
		let firstError = result.array()[0].msg;
		return res.json({ err: true, msg: firstError });
	}

	// Gather all required data
	let
		{
			transTypeOptionCode,
			transCurrency,
			accountFrom,
			amount,
			comment, } = req.body;

	// Convert from string
	amount = Number(amount);
	transTypeOptionCode = Number(transTypeOptionCode);
	transCurrency = Number(transCurrency);

	// Since only member can exchange, we collect all the 
	// useraccount whose role is member
	let managedAccounts;
	try {
		managedAccounts = await getManagedUsers(req, transCurrency);
	}
	catch (error) {
		req.logger.error(`${error.message}`);
		return res.json({ err: true, msg: 'Server 錯誤' });
	}
	
	// If accountFrom is not found, then sender is invalid
	let sender = managedAccounts.find(row => (row.account === accountFrom));
	if (!sender) return res.json({ err: true, msg: '轉換無效' });

	// Get storeInfo
	let targetStore;
    let storeString = `	SELECT U.id AS uid, U.account, U.GSCash, U.name, store.id, store.exchangeRate
						FROM UserAccount AS U
						INNER JOIN StoreInfo AS store
							ON store.uid = U.id
						WHERE store.id=?;
					`;
	let values = [transCurrency];
	storeString = mysql.format(storeString, values);
	try {
		targetStore = await sqlAsync.query(req.db, storeString);
	} catch (error) {
		req.logger.error(`${error.message}`);
		return res.json({ err: true, msg: '轉換無效'});
	}

	// Check sender's & store's avail balance 
	try {
		await validateTransSender(req, sender, amount, transTypeOptionCode, targetStore[0]['exchangeRate'], transCurrency);
	} catch (error) {
		req.logger.error(`${error.message}`);
		return res.json({ err: true, msg: '可用餘額不足' });
	}

	// get query string
	let sqlString = getExchangeString(req, sender, amount, transTypeOptionCode, targetStore[0], comment);
	// Execute transaction
	// Transfer cash
	try {
		await sqlAsync.query(req.db, 'START TRANSACTION');
		await sqlAsync.query(req.db, sqlString);
	}
	catch (error) {
		await sqlAsync.query(req.db, 'ROLLBACK'); // rollback transaction if a statement produce error
		req.logger.error(`${error.message}`);
		return res.json({ err: true, msg: 'Server 錯誤' });
	}
	await sqlAsync.query(req.db, 'COMMIT');  // commit transaction only if all statement has executed without error

	// Log
	if(transTypeOptionCode === 0){
		//req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] exchange cash[${amount}] from account[${sender.account}] role[${sender.role}] to account[${receiver.account}] role[${receiver.role}]`);
	}
	else if(transTypeOptionCode === 1){
		//req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] exchange cash[${amount}] from account[${sender.account}] role[${sender.role}] to account[${receiver.account}] role[${receiver.role}]`);
	}

	return res.json({ err: false, msg: 'success' });
};
	

// Determine all accounts managed by this user
// It returns an array contains all account infos managed by this user, including himself
// Special case : all service agents manage their admin's account, they don't have wallet themselves
// Please execute it in try catch 
async function getManagedUsers(req, transCurrency) {
	// Prepare query
	let sqlString, values;
	if (req.user.role === 'admin') {
		sqlString = `	SELECT 
							U.id AS uid, U.account, U.GSCash, U.name,
							Mem.id AS memId
						FROM UserAccount AS U
						INNER JOIN MemberInfo AS Mem
							ON Mem.uid = U.id
						INNER JOIN AgentInfo AS Ag
							ON Mem.agentId = Ag.id
						WHERE U.role = 'member' AND Ag.storeId=?
					;`;
		values = [transCurrency];
		sqlString = mysql.format(sqlString, values);
	}
	else {
		// Invalid role
		throw Error('invalid role');
	}

	// Execute query
	let results = await sqlAsync.query(req.db, sqlString);

	return results;
}

// Validate sender's transaction
// Given role and role id 
// Check transfer amount against sender's avail balance
// Please execute it in try catch 
async function validateTransSender(req, sender, amount, transTypeOptionCode, exchangeRate, transCurrency) {

	// Prepare query
	let sqlString, values, results;

	if(transTypeOptionCode === 0){
		// store to Main
		// check store MainCurrency avail
		sqlString = ` 	SELECT U.GSCash
						FROM UserAccount AS U
						INNER JOIN StoreInfo AS store
							ON store.uid = U.id
						WHERE store.id=?
					;`;
		values = [transCurrency];
		sqlString = mysql.format(sqlString, values);

        results = await sqlAsync.query(req.db, sqlString);

		if(results[0].GSCash - amount < 0) throw Error(`account[${req.user.account}] exchange member account[${sender.account}] storeCurrency[${transCurrency}] to mainCurrency amount[${amount}] but store mainCurrency not enough`);

		// check member storeCurrency
		sqlString = `	SELECT 
                            Mem.availBalance AS memberAvail,
                            Ab.totalAvail AS agentAvail,
                            Sb.totalAvail AS storeAvail,
                            Admb.totalAvail AS adminAvail
                        FROM MemberInfo AS Mem
                        INNER JOIN AgentInfo AS Ag
                            ON Mem.agentId=Ag.id
                        INNER JOIN AgentBalance AS Ab
                            ON Ag.id=Ab.id
                        INNER JOIN StoreInfo AS store
                            ON Ag.storeId=store.id
                        INNER JOIN StoreBalance AS Sb
                            ON store.id=Sb.id
                        INNER JOIN AdminInfo AS Adm
                            ON store.adminId=Adm.id
                        INNER JOIN AdminBalance AS Admb
                            ON Adm.id=Admb.id
                        WHERE Mem.id=?
					;`;
		values = [sender.memId];
		sqlString = mysql.format(sqlString, values);

		results = await sqlAsync.query(req.db, sqlString);
        let outflowAmount = Math.ceil(amount * exchangeRate);

		if (results[0].cash - outflowAmount < 0) throw Error(`account[${req.user.account}] exchange member account[${sender.account}] storeCurrency[${transCurrency}] to mainCurrency amount[${amount}] but memberAvail not enough`);
		if (results[0].agentAvail - outflowAmount < 0) throw Error(`account[${req.user.account}] exchange member account[${sender.account}] storeCurrency[${transCurrency}] to mainCurrency amount[${amount}] but agentAvail not enough`);
		if (results[0].storeAvail - outflowAmount < 0) throw Error(`account[${req.user.account}] exchange member account[${sender.account}] storeCurrency[${transCurrency}] to mainCurrency amount[${amount}] but storeAvail not enough`);
		if (results[0].adminAvail - outflowAmount < 0) throw Error(`account[${req.user.account}] exchange member account[${sender.account}] storeCurrency[${transCurrency}] to mainCurrency amount[${amount}] but adminAvail not enough`);

	}
	else if(transTypeOptionCode === 1){
		// Main to store
		// check member Main Currency avail
		sqlString = `	SELECT U.GSCash
						FROM UserAccount AS U
						WHERE U.account=?
					;`;
		values = [sender.account];
		sqlString = mysql.format(sqlString, values);

		results = await sqlAsync.query(req.db, sqlString);

		if(results[0].GSCash - amount < 0) throw Error(`account[${req.user.account}] exchange member account[${sender.account}] mainCurrency to storeCurrency[${transCurrency}] amount[${amount}] but member mainCurrency not enough`);
	}
	else{
		// Invalid transTypeOptionCode
		throw Error('invalid transTypeOptionCode');
	}

}

function getExchangeString(req, sender, amount, transTypeOptionCode, targetStore, comment) {
	let sqlString, values;
	if(transTypeOptionCode === 0) {
        // store to Main
        let storeCurrencyAmount = Math.ceil(amount * targetStore.exchangeRate);
		let sqlString1 = `	UPDATE UserAccount
							SET GSCash=GSCash+?
							WHERE id=?
						;`;
		values = [amount, sender.uid];
		sqlString1 = mysql.format(sqlString1, values);

		let sqlString2 = `	UPDATE UserAccount
							SET GSCash=GSCash-?
							WHERE id=?
						;`;
		values = [amount, targetStore.uid];
		sqlString2 = mysql.format(sqlString2, values);

		let sqlStringRecord1 = `INSERT INTO MainTransaction 
								(uid, transTypeCode, amount, relatedId, relatedName, comment)
								VALUES (?, ?, ?, ?, ?, ?);`;
		values = [sender.uid, 7, amount, targetStore.uid, targetStore.name, '兌換'];
		sqlStringRecord1 = mysql.format(sqlStringRecord1, values);

		let sqlStringRecord2 = `INSERT INTO MainTransaction 
								(uid, transTypeCode, amount, relatedId, relatedName, comment)
								VALUES (?, ?, ?, ?, ?, ?);`;
		values = [targetStore.uid, 7, -1 * amount, sender.uid, sender.name, '兌換'];
		sqlStringRecord2 = mysql.format(sqlStringRecord2, values);

		let sqlString3 = `	UPDATE MemberInfo
							SET cash=cash-?
							WHERE id=?;
						`;
		values = [storeCurrencyAmount, sender.memId];
		sqlString3 = mysql.format(sqlString3, values);

		let sqlString4 = `	UPDATE AdminInfo
							SET cash=cash+?
							WHERE uid=?;
						`;
		values = [storeCurrencyAmount, req.user.id];
		sqlString4 = mysql.format(sqlString4, values);


		let sqlStringRecord3 = `INSERT INTO StoreTransaction 
								(uid, transTypeCode, amount, relatedId, relatedName, storeId, comment)
								VALUES (?, ?, ?, ?, ?, ?, ?);`;
                                values = [sender.uid, 7, -1*storeCurrencyAmount, req.user.id, req.user.name, targetStore.id, '兌換'];
		sqlStringRecord3 = mysql.format(sqlStringRecord3, values);

		let sqlStringRecord4 = `INSERT INTO StoreTransaction 
								(uid, transTypeCode, amount, relatedId, relatedName, storeId, comment)
								VALUES (?, ?, ?, ?, ?, ?, ?);`;
                                values = [req.user.id, 7, storeCurrencyAmount, sender.uid, sender.name, targetStore.id, '兌換'];
		sqlStringRecord4 = mysql.format(sqlStringRecord4, values);

		let sqlStringRecord5 = `INSERT INTO ExchangeRecord
								(uid, amount, transTypeCode, storeId, comment)
								VALUES (?, ?, ?, ?, ?);`;
		values = [sender.uid, amount, 7, targetStore.id, comment];
		sqlStringRecord5 = mysql.format(sqlStringRecord5, values);

		sqlString = sqlString1 + sqlString2 + sqlString3 + sqlString4 + sqlStringRecord1 + sqlStringRecord2 + sqlStringRecord3 + sqlStringRecord4 + sqlStringRecord5;
	}
	else if(transTypeOptionCode === 1) {
        // Main to store
        let storeCurrencyAmount = Math.floor(amount * targetStore.exchangeRate);
		let sqlString1 = `	UPDATE UserAccount
							SET GSCash=GSCash-?
							WHERE id=?;
						`;
		values = [amount, sender.uid];
		sqlString1 = mysql.format(sqlString1, values);

		let sqlString2 = `	UPDATE UserAccount
							SET GSCash=GSCash+?
							WHERE id=?;
						`;
		values = [amount, targetStore.uid];
		sqlString2 = mysql.format(sqlString2, values);

		let sqlStringRecord1 = `INSERT INTO MainTransaction 
								(uid, transTypeCode, amount, relatedId, relatedName, comment)
								VALUES (?, ?, ?, ?, ?, ?);`;
		values = [sender.uid, 6, -1*amount, targetStore.uid, targetStore.name, '兌換'];
		sqlStringRecord1 = mysql.format(sqlStringRecord1, values);

		let sqlStringRecord2 = `INSERT INTO MainTransaction 
								(uid, transTypeCode, amount, relatedId, relatedName, comment)
								VALUES (?, ?, ?, ?, ?, ?);`;
		values = [targetStore.uid, 6, amount, sender.uid, sender.name, '兌換'];
		sqlStringRecord2 = mysql.format(sqlStringRecord2, values);

		let sqlString3 = `	UPDATE MemberInfo
							SET cash=cash+?
							WHERE id=?;
						`;
        values = [storeCurrencyAmount, sender.memId];
		sqlString3 = mysql.format(sqlString3, values);

		let sqlString4 = `	UPDATE AdminInfo
							SET cash=cash-?
							WHERE uid=?;
						`;
        values = [storeCurrencyAmount, req.user.id];
		sqlString4 = mysql.format(sqlString4, values);

		let sqlStringRecord3 = `INSERT INTO StoreTransaction 
								(uid, transTypeCode, amount, relatedId, relatedName, storeId, comment)
								VALUES (?, ?, ?, ?, ?, ?, ?);`;
                                values = [sender.uid, 6, storeCurrencyAmount, req.user.id, req.user.name, targetStore.id, '兌換'];
		sqlStringRecord3 = mysql.format(sqlStringRecord3, values);

		let sqlStringRecord4 = `INSERT INTO StoreTransaction 
								(uid, transTypeCode, amount, relatedId, relatedName, storeId, comment)
								VALUES (?, ?, ?, ?, ?, ?, ?);`;
                                values = [req.user.id, 6, -1*storeCurrencyAmount, sender.uid, sender.name, targetStore.id, '兌換'];
		sqlStringRecord4 = mysql.format(sqlStringRecord4, values);

		let sqlStringRecord5 = `INSERT INTO ExchangeRecord
								(uid, amount, transTypeCode, storeId, comment)
								VALUES (?, ?, ?, ?, ?);`;
		values = [sender.uid, amount, 6, targetStore.id, comment];
		sqlStringRecord5 = mysql.format(sqlStringRecord5, values);
		sqlString = sqlString1 + sqlString2 + sqlString3 + sqlString4 + sqlStringRecord1 + sqlStringRecord2 + sqlStringRecord3 + sqlStringRecord4 + sqlStringRecord5;
	}
	return sqlString;
}

// Form data validate generators
// Invoke it to produce a middleware for validating
function exchangeValidator() {
	return [
		// Check format
		// All values must be string
		body('*')
			.isString().withMessage('Wrong data format'),

		body('transTypeOptionCode')
            .isLength({ min: 1 }).withMessage('轉換類型不可为空')
            .isLength({ max: 10 }).withMessage('轉換類型代碼長度不可超過 10')
            .isInt({ min: 0 }).withMessage('轉換類型代碼必須是數字'),
		body('accountFrom')
			.isLength({ min: 1 }).withMessage('帳號不可爲空')
			.isLength({ max: 20 }).withMessage('帳號長度不可超過 20')
			.isAlphanumeric().withMessage('帳號只能含有數字或英文字母'),
		body('amount')
            .isInt({ min: 1, max: 99999999999 }).withMessage('轉換數量必須介於 1 ～ 99999999999 之間的整數'),
		body('transPwd')
			.isLength({ min: 1 }).withMessage('交易密碼不可爲空')
			.isLength({ max: 20 }).withMessage('交易密碼長度不可超過 20')
			.isAlphanumeric().withMessage('交易密碼只能含有數字或英文字母'),
		body('comment')
			.isLength({ min: 0, max: 40 }).withMessage('備註長度不可超過 40'),

		// Sanitize all values 
		sanitizeBody('*')
			.escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
			.trim(), // trim white space from both end

		// Check password
		body('transPwd').custom(async function (data, { req }) {

			// Prepare query
			let sqlString = `SELECT * 
                            FROM UserAccount 
                            WHERE account=? AND transPwd=?;
                            `;
			let values = [req.user.account, data];
			sqlString = mysql.format(sqlString, values);

			// Check if password is correct
			let results;
			try {
				results = await sqlAsync.query(req.db, sqlString);
			}
			catch (error) {
				req.logger.error(`${error.message}`);
				throw Error('Server 錯誤');
			}

			if (results.length <= 0) throw Error('請輸入正確的交易密碼');
			return true;
		}),

		// Check transTypeOptionCode
		body('transTypeOptionCode').custom(async function (data, { req }) {

			let optionCode = Number(data);

			if (req.user.role === 'member') {
				if (optionCode !== 0) throw Error('轉帳類型錯誤'); // Special case, member can only use code 0
			}
			else {
				let result = transTypeOptions.find((element) => (element.code === optionCode));
				if (!result) throw Error('轉帳類型錯誤');
			}

			return true;
		}),

		// check inflow outflow
		body('transCurrency').custom(async function (data, { req }) {
			let transTypeOptionCode = Number(req.body.transTypeOptionCode);

			// prepare query
			let sqlString = `	SELECT *
								FROM StoreInfo AS store
								WHERE store.id = ?;`;
			let values = [data];
			sqlString = mysql.format(sqlString, values);

			let results;
			try {
				results = await sqlAsync.query(req.db, sqlString);
			}
			catch (error) {
				req.logger.error(`${error.message}`);
				throw Error('Server 錯誤');
			}

			if(results[0].inflow === 0 && transTypeOptionCode === 1){
				throw Error('該店家不支援此轉換');
			}
			else if(results[0].outflow === 0 && transTypeOptionCode === 0){
				throw Error('該店家不支援此轉換');
			}
			else{
				return true;
			}
		}),
	];
}

module.exports = {
	render: exchangeRenderHandler,
	exchange: exchangeFormHandler,
	exchangeValidate: exchangeValidator(),
	// purchase: purchaseFormHandler,
	// purchaseValidate: purchaseValidator(),
};