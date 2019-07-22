const
	mysql = require('mysql'),
    sqlAsync = require('../../../libs/sqlAsync'),
    notification = require('../../../libs/notification'),
	// emoji = require('node-emoji'),
	{ body, validationResult } = require('express-validator/check'),
	{ sanitizeBody } = require('express-validator/filter');
	// moment = require('moment');

const transTypeOptions = [
	{
		code: 0,
		description: `一般轉帳`,
		class: `primary`,
		senderTransType: 0,
		receiverTransType: 1,
	},
];

let transferRenderHandler = async function (req, res) {

	// Generate transTypeOptions based on role
	let transTypeOptionsData = transTypeOptions;

	if (req.user.role === 'member') {
		transTypeOptionsData = transTypeOptionsData.filter((row) => (row.code === 0));
	}

	return res.render('home/mainCurrency/transfer', { layout: 'home', transTypeOptions: transTypeOptionsData });
};

let transferFormHandler = async function (req, res) {

	const result = validationResult(req);

	// If the form data is invalid
	if (!result.isEmpty()) {
		// Return the first error to client
		let firstError = result.array()[0].msg;
		return res.json({ err: true, msg: firstError });
	}

	// role auth check, this should only be used by admin
	if(req.user.role !== 'admin'){
		return res.json({ err: true, msg: '權限不足'});
	} 

	// Gather all required data
	let
		{
			// transTypeOptionCode,
			accountFrom,
			accountTo,
			amount,
			comment, } = req.body;

	// Convert from string
	amount = Number(amount);


    // Collect all accounts infos managed by this user, including this user itself
    // For mainCurrency, get all UserAccount
	let managedAccounts;

	try {
		managedAccounts = await getManagedUsers(req);
	}
	catch (error) {
		req.logger.error(`${error.message}`);
		return res.json({ err: true, msg: 'Server 錯誤' });
	}

	// If accountFrom is not found, then sender is invalid
	let sender = managedAccounts.find(row => (row.account === accountFrom));
	if (!sender) return res.json({ err: true, msg: '轉帳無效' });

	// If accountTo is not found, then receiver is invalid
	let receiver = managedAccounts.find(row => (row.account === accountTo));
	if (!receiver) return res.json({ err: true, msg: '轉帳無效' });


	// Check sender's avail balance 
	try {
		await validateMainTransSender(req, sender.uid, amount);
	} catch (error) {
		req.logger.error(`${error.message}`);
		return res.json({ err: true, msg: '可用聯盟幣不足' });
	}


	// Determine transTypeCode
	// for now, we just use transTypeCode 0 & 1
	// [TODO] discuss mainTransaction transTypeCode
	// let transTypeData = transTypeOptions.find((element) => (element.code === transTypeOptionCode));
	// sender.transTypeCode = transTypeData.senderTransType;
	// receiver.transTypeCode = transTypeData.receiverTransType;


	// Prepare query
	// Query for update sender
	let sqlStringSender = `UPDATE UserAccount
                           SET GSCash=GSCash-?
                           WHERE id=?
                           ;`;
	let values = [amount, sender.uid];
	sqlStringSender = mysql.format(sqlStringSender, values);
	// Query for update receiver
	let sqlStringReceiver = `UPDATE UserAccount
                            SET GSCash=GSCash+?
                            WHERE id=?
                            ;`;
	values = [amount, receiver.uid];
	sqlStringReceiver = mysql.format(sqlStringReceiver, values);

	// Query for transaction record
	let sqlStringRecord1 = `INSERT INTO MainTransaction 
                            (uid, transTypeCode, amount, relatedId, relatedName, comment)
                            VALUES (?, 0, ?, ?, ?, ?);`;
	values = [sender.uid, amount * -1, receiver.uid, receiver.name, comment];
	sqlStringRecord1 = mysql.format(sqlStringRecord1, values);

	let sqlStringRecord2 = `INSERT INTO MainTransaction 
                            (uid, transTypeCode, amount, relatedId, relatedName, comment)
                            VALUES (?, 1, ?, ?, ?, ?);`;
	values = [receiver.uid, amount, sender.uid, sender.name, comment];
	sqlStringRecord2 = mysql.format(sqlStringRecord2, values);

	// Execute transaction
	// Transfer cash
	try {
		await sqlAsync.query(req.db, 'START TRANSACTION');
		await sqlAsync.query(req.db, sqlStringSender + sqlStringReceiver + sqlStringRecord1 + sqlStringRecord2);
	}
	catch (error) {
		await sqlAsync.query(req.db, 'ROLLBACK'); // rollback transaction if a statement produce error
		req.logger.error(`${error.message}`);
		return res.json({ err: true, msg: 'Server 錯誤' });
	}
	await sqlAsync.query(req.db, 'COMMIT');  // commit transaction only if all statement has executed without error

	// Log
	req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] transfer cash[${amount}] from account[${sender.account}] role[${sender.role}] to account[${receiver.account}] role[${receiver.role}]`);
    // send notification
	let content = `收到來自 ${sender.name} 的 魂幣 ${amount}`;
	let targetUids = [receiver.uid];
	try{
		await notification.createNotification(req, req.user.id, targetUids, content);
	}
	catch (error) {
		req.logger.error(`${error.message}`);
	}
	return res.json({ err: false, msg: 'success' });
};

// Determine all accounts managed by this user
// It returns an array contains all account infos managed by this user, including himself
// Special case : all service agents manage their admin's account, they don't have wallet themselves
// Please execute it in try catch 
async function getManagedUsers(req) {
	// Prepare query
	let sqlString, values;
	if (req.user.role === 'admin') {
        sqlString = `SELECT id AS uid, account, name, GSCash, role
                     FROM UserAccount
                    ;`;
	}
	else {
		// Invalid role
		throw Error('invalid role');
	}

	// Execute query
	let results = await sqlAsync.query(req.db, sqlString);

	return results;
}

// For transfer special case : member -> member
// select all the member menanged by the same Store as the sender
// it return a array contain the members and sender itself
// Please execute it in try catch 
async function getSameStoreMember(req) {
	// check auth, this function should only be used for role member
	if (req.user.role !== 'member') {
		throw Error('invalid role');
	}

	// prepare sql
	let sqlString, values, result;

	// First. select the storeId
	sqlString = `SELECT store.id
                FROM StoreInfo AS store
                INNER JOIN AgentInfo AS Ag
                    ON Ag.storeId = store.id
                INNER JOIN MemberInfo AS Mem
                    ON Mem.agentId = Ag.id
                WHERE Mem.uid = ? ;`;
	values = [req.user.id];
	sqlString = mysql.format(sqlString, values);
	try {
		result = await sqlAsync.query(req.db, sqlString);
	}
	catch (error) {
		throw Error(`${error.message}`);
	}
	if (result.legnth <= 0) {
		throw Error(`account[${req.user.account}] role[${req.user.role}] try to transfer cash but could not find the store`);
	}

	// Second. select the members
	sqlString = `SELECT U.id AS uid, U.account, Mem.id, U.name, Mem.cash, U.role
                FROM MemberInfo AS Mem
                INNER JOIN UserAccount AS U
                    ON U.id = Mem.uid
                INNER JOIN AgentInfo AS Ag
                    ON Mem.agentId = Ag.id
                INNER JOIN StoreInfo AS store
                    ON store.id = Ag.storeId
                WHERE store.id = ?;`;
	values = [result[0]['id']];
	sqlString = mysql.format(sqlString, values);
	try {
		result = await sqlAsync.query(req.db, sqlString);
	}
	catch (error) {
		throw Error(`${error.message}`);
	}

	return result;
}

// Validate sender's transaction
// Given role and role id 
// Check transfer amount against sender's avail balance
// Please execute it in try catch 
async function validateMainTransSender(req, roleUid, amount) {

	// Prepare query
	let sqlString, values, results;

	sqlString = `	SELECT U.GSCash AS senderMainAvail
					FROM UserAccount AS U
					WHERE U.id = ?;`;
	values = [roleUid];
	sqlString = mysql.format(sqlString, values);

	results = await sqlAsync.query(req.db, sqlString);

	if (results[0].senderMainAvail - amount < 0) throw Error(`account[${req.user.account}] transfer GSCash[${amount}] from sender roleUid[${roleUid}], but has not enough GSCash availbalnce[${results[0].senderMainAvail}]`);

}

// Form data validate generators
// Invoke it to produce a middleware for validating
function transferValidator() {
	return [
		// Check format
		// All values must be string
		body('*')
			.isString().withMessage('Wrong data format'),

		// body('transTypeOptionCode')
		// 	.isLength({ min: 1 }).withMessage('轉帳類型不可为空')
		// 	.isLength({ max: 10 }).withMessage('轉帳類型代碼長度不可超過 10')
		// 	.isInt({ min: 0 }).withMessage('轉帳類型代碼必須是數字'),
		body('accountFrom')
			.isLength({ min: 1 }).withMessage('帳號不可爲空')
			.isLength({ max: 20 }).withMessage('帳號長度不可超過 20')
			.isAlphanumeric().withMessage('帳號只能含有數字或英文字母'),
		body('accountTo')
			.isLength({ min: 1 }).withMessage('帳號不可爲空')
			.isLength({ max: 20 }).withMessage('帳號長度不可超過 20')
			.isAlphanumeric().withMessage('帳號只能含有數字或英文字母')
			.custom(function (data, { req }) { return data !== req.body.accountFrom; }).withMessage('轉入帳號不能跟轉出帳號相同'),
		body('amount')
			.isInt({ min: 1, max: 99999999999 }).withMessage('轉帳數量必須介於 1 ～ 99999999999 之間的整數'),
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
		// body('transTypeOptionCode').custom(async function (data, { req }) {

		// 	let optionCode = Number(data);

		// 	if (req.user.role === 'member') {
		// 		if (optionCode !== 0) throw Error('轉帳類型錯誤'); // Special case, member can only use code 0
		// 	}
		// 	else {
		// 		let result = transTypeOptions.find((element) => (element.code === optionCode));
		// 		if (!result) throw Error('轉帳類型錯誤');
		// 	}

		// 	return true;
		// }),
	];
}

module.exports = {
	render: transferRenderHandler,
	transfer: transferFormHandler,
	transferValidate: transferValidator(),
	// purchase: purchaseFormHandler,
	// purchaseValidate: purchaseValidator(),
};