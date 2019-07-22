const
	mysql = require('mysql'),
    sqlAsync = require('../../../libs/sqlAsync'),
    util = require('../../../libs/util'),
	emoji = require('node-emoji'),
	{ body, validationResult } = require('express-validator/check'),
	{ sanitizeBody } = require('express-validator/filter'),
	moment = require('moment');

let autoTransferRenderHandler = async function (req, res) {
	return res.render('home/storeCurrency/autoTransfer', { layout: 'home' });
}

let autoTransferUploadHandler = async function (req, res) {
	if(req.user.role !== 'store') {
		return res.json({err: true, msg: '權限不足'});
	}

	if(req.body['data'] === undefined) {
		return res.json({err: true, msg: '該檔案為空白檔案'});
	}

	console.log(req.body);

	const result = validationResult(req);

	// If the form data is invalid
	if (!result.isEmpty()) {
		// Return the first error to client
		let firstError = result.array()[0].msg;
		return res.json({ err: true, msg: firstError });
	}

	let data = req.body['data'];
	let transCurrency = req.user.roleId;
	let managedAccounts;
	try {
		managedAccounts = await getManagedUsers(req, transCurrency);
	}
	catch (error) {
		req.logger.error(`${error.message}`);
		return res.json({ err: true, msg: 'Server 錯誤' });
	}

	let errorDtail = [];

	for(let i=0; i < data.length; i++) {
		// prepare data
		let accountFrom = data[i]['轉出帳號'];
		let accountTo = data[i]['轉入帳號'];
		let amount = Number(data[i]['數量']);
        let comment = ( data[i]['備註'] !== undefined) ? data[i]['備註'] : '';

        if(amount === 0) continue;

		// If accountFrom is not found, then sender is invalid
		let sender = managedAccounts.find(row => (row.account === accountFrom));
		if (!sender) {
			let err = {'index': i, 'msg': '轉出帳號錯誤'};
			errorDtail.push(err);
			continue;
		}

		// If accountTo is not found, then receiver is invalid
		let receiver = managedAccounts.find(row => (row.account === accountTo));
		if (!receiver) {
			let err = {'index': i, 'msg': '轉入帳號錯誤'};
			errorDtail.push(err);
			continue
		};

		// Check sender's avail balance 
		try {
			await validateTransSender(req, sender.role, sender.id, amount);
		} catch (error) {
			req.logger.error(`${error.message}`);
			let err = {'index': i, 'msg': `可用點數不足`};
			errorDtail.push(err);
			continue;
		}

        // Determine update table for sender and receiver 
		sender.table = util.roleToTable(sender.role);
		receiver.table = util.roleToTable(receiver.role);

		sender.transTypeCode = 0;
		receiver.transTypeCode = 1;

		// Prepare query
		// Query for update sender
		let sqlStringSender = `UPDATE ??
								SET cash=cash-?
								WHERE id=?
								;`;
		let values = [sender.table, amount, sender.id];
		sqlStringSender = mysql.format(sqlStringSender, values);
		// Query for update receiver
		let sqlStringReceiver = `UPDATE ??
								SET cash=cash+?
								WHERE id=?
								;`;
		values = [receiver.table, amount, receiver.id];
		sqlStringReceiver = mysql.format(sqlStringReceiver, values);

		// Query for transaction record
		let sqlStringRecord1 = `INSERT INTO StoreTransaction 
								(uid, transTypeCode, amount, relatedId, relatedName, storeId, comment)
								VALUES (?, ?, ?, ?, ?, ?, ?);`;
		values = [sender.uid, sender.transTypeCode, amount * -1, receiver.uid, receiver.name, transCurrency, comment];
		sqlStringRecord1 = mysql.format(sqlStringRecord1, values);

		let sqlStringRecord2 = `INSERT INTO StoreTransaction 
								(uid, transTypeCode, amount, relatedId, relatedName, storeId, comment)
								VALUES (?, ?, ?, ?, ?, ?, ?);`;
		values = [receiver.uid, receiver.transTypeCode, amount, sender.uid, sender.name, transCurrency, comment];
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
			let err = {'index': i, 'msg': 'server error'};
			errorDtail.push(err);
			continue;
		}
		await sqlAsync.query(req.db, 'COMMIT');  // commit transaction only if all statement has executed without error

		// Log
		req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] transfer cash[${amount}] from account[${sender.account}] role[${sender.role}] to account[${receiver.account}] role[${receiver.role}] by autoTransfer`);

	}
	if(errorDtail.length > 0) {
		return res.json({ err: true, msg: '執行過程發生錯誤', detail: errorDtail});
	}
	else {
		return res.json({ err: false, msg: 'success' });
	}
}

// Determine all accounts managed by this user
// It returns an array contains all account infos managed by this user, including himself
// Special case : all service agents manage their admin's account, they don't have wallet themselves
// Please execute it in try catch 
// transCurrency: the storeId of the Currency
async function getManagedUsers(req, transCurrency) {
	// Prepare query
	let sqlString, values;
	if (req.user.role === 'agent') {
		sqlString = `(
                        SELECT U.id AS uid, U.account, Ag.id, U.name, Ag.cash, U.role
                        FROM AgentInfo AS Ag
                        INNER JOIN UserAccount AS U
							ON U.id=Ag.uid
                        WHERE Ag.id=? AND Ag.storeId=?
                    )
                    UNION
                    (
                        SELECT U.id AS uid, U.account, Mem.id, U.name, Mem.cash, U.role
                        FROM MemberInfo AS Mem
                        INNER JOIN UserAccount AS U
							ON U.id=Mem.uid
						INNER JOIN AgentInfo AS Ag
							ON Mem.agentId = Ag.id
                        WHERE Mem.agentId=? AND Ag.storeId=?
                    )
                    ;`;
		values = [req.user.roleId, transCurrency, req.user.roleId, transCurrency];
		sqlString = mysql.format(sqlString, values);
	}
	else if (req.user.role === 'store') {
		sqlString = `(
                        SELECT U.id AS uid, U.account, store.id, U.name, store.cash, U.role 
                        FROM StoreInfo AS store
                        INNER JOIN UserAccount AS U
                            ON U.id=store.uid
                        WHERE store.id=?
                    )
                    UNION
                    (
                        SELECT U.id AS uid, U.account, Ag.id, U.name, Ag.cash, U.role
                        FROM AgentInfo AS Ag
                        INNER JOIN UserAccount AS U
                            ON U.id=Ag.uid
                        WHERE Ag.storeId=?
                    )
                    UNION
                    (
                        SELECT U.id AS uid, U.account, Mem.id, U.name, Mem.cash, U.role
                        FROM MemberInfo AS Mem
                        INNER JOIN UserAccount AS U
                            ON U.id=Mem.uid

                        INNER JOIN AgentInfo AS Ag
                            ON Ag.id=Mem.agentId
                        WHERE Ag.storeId=?
                    )
                    ;`;
		values = [transCurrency, transCurrency, transCurrency];
		sqlString = mysql.format(sqlString, values);
	}
	else if (req.user.role === 'admin') {
		sqlString = `(
                        SELECT U.id AS uid, U.account, Adm.id, U.name, Adm.cash, U.role
                        FROM AdminInfo AS Adm
                        INNER JOIN UserAccount AS U
                            ON U.id=Adm.uid

                        WHERE Adm.id=?
                    )
                    UNION
                    (
                        SELECT U.id AS uid, U.account, store.id, U.name, store.cash, U.role
                        FROM StoreInfo AS store
                        INNER JOIN UserAccount AS U
                            ON U.id=store.uid

                        WHERE store.adminId=? AND store.id=?
                    )
                    UNION
                    (   
                        SELECT U.id AS uid, U.account, Ag.id, U.name, Ag.cash, U.role
                        FROM AgentInfo AS Ag
                        INNER JOIN UserAccount AS U
                            ON U.id=Ag.uid

                        INNER JOIN StoreInfo AS store
							ON store.id=Ag.storeId 
						
						WHERE store.adminId=? AND store.id=?
                    )
                    UNION
                    (
                        SELECT U.id AS uid, U.account, Mem.id, U.name, Mem.cash, U.role
                        FROM MemberInfo AS Mem
                        INNER JOIN UserAccount AS U
                            ON U.id=Mem.uid

                        INNER JOIN AgentInfo AS Ag
                            ON Ag.id=Mem.agentId
                        INNER JOIN StoreInfo AS store
							ON store.id=Ag.storeId 
							
						WHERE store.adminId=? AND store.id=?
                    )
                    ;`;
		values = [req.user.roleId, req.user.roleId, transCurrency, req.user.roleId, transCurrency, req.user.roleId, transCurrency];
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
async function validateTransSender(req, role, roleId, amount) {

	// Prepare query
	let sqlString, values, results;

	if (role === 'member') {
		sqlString = `   SELECT 
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
                    `;
		values = [roleId];
		sqlString = mysql.format(sqlString, values);

		results = await sqlAsync.query(req.db, sqlString);

		if (results[0].memberAvail - amount < 0) throw Error(`account[${req.user.account}] role[${req.user.role}] transfer cash[${amount}] from sender role[${role}] roleId[${roleId}], but has not enough member availbalnce[${results[0].memberAvail}]`);
		if (results[0].agentAvail - amount < 0) throw Error(`account[${req.user.account}] role[${req.user.role}] transfer cash[${amount}] from sender role[${role}] roleId[${roleId}], but has not enough agent availbalnce[${results[0].agentAvail}]`);
		if (results[0].storeAvail - amount < 0) throw Error(`account[${req.user.account}] role[${req.user.role}] transfer cash[${amount}] from sender role[${role}] roleId[${roleId}], but has not enough store availbalnce[${results[0].storeAvail}]`);
		if (results[0].adminAvail - amount < 0) throw Error(`account[${req.user.account}] role[${req.user.role}] transfer cash[${amount}] from sender role[${role}] roleId[${roleId}], but has not enough admin availbalnce[${results[0].adminAvail}]`);
	}
	else if (role === 'agent') {
		sqlString = `   SELECT 
                            Ab.totalAvail AS agentAvail,
                            Sb.totalAvail AS storeAvail,
                            Admb.totalAvail AS adminAvail
                        FROM AgentInfo AS Ag
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
                        WHERE Ag.id=?
                    `;
		values = [roleId];
		sqlString = mysql.format(sqlString, values);

		results = await sqlAsync.query(req.db, sqlString);

		if (results[0].agentAvail - amount < 0) throw Error(`account[${req.user.account}] role[${req.user.role}] transfer cash[${amount}] from sender role[${role}] roleId[${roleId}], but has not enough agent availbalnce[${results[0].agentAvail}]`);
		if (results[0].storeAvail - amount < 0) throw Error(`account[${req.user.account}] role[${req.user.role}] transfer cash[${amount}] from sender role[${role}] roleId[${roleId}], but has not enough store availbalnce[${results[0].storeAvail}]`);
		if (results[0].adminAvail - amount < 0) throw Error(`account[${req.user.account}] role[${req.user.role}] transfer cash[${amount}] from sender role[${role}] roleId[${roleId}], but has not enough admin availbalnce[${results[0].adminAvail}]`);
	}
	else if (role === 'store') {
		sqlString = `   SELECT 
                            Sb.totalAvail AS storeAvail,
                            Admb.totalAvail AS adminAvail
                        FROM StoreInfo AS store
                        INNER JOIN StoreBalance AS Sb
                            ON store.id=Sb.id
                        INNER JOIN AdminInfo AS Adm
                            ON store.adminId=Adm.id
                        INNER JOIN AdminBalance AS Admb
                            ON Adm.id=Admb.id
                        WHERE store.id=?
                    `;
		values = [roleId];
		sqlString = mysql.format(sqlString, values);

		results = await sqlAsync.query(req.db, sqlString);

		if (results[0].storeAvail - amount < 0) throw Error(`account[${req.user.account}] role[${req.user.role}] transfer cash[${amount}] from sender role[${role}] roleId[${roleId}], but has not enough store availbalnce[${results[0].storeAvail}]`);
		if (results[0].adminAvail - amount < 0) throw Error(`account[${req.user.account}] role[${req.user.role}] transfer cash[${amount}] from sender role[${role}] roleId[${roleId}], but has not enough admin availbalnce[${results[0].adminAvail}]`);
	}
	else if (role === 'admin') {
		sqlString = `   SELECT 
                            Admb.totalAvail AS adminAvail
                        FROM AdminBalance AS Admb
                        WHERE Admb.id=?
                    `;
		values = [roleId];
		sqlString = mysql.format(sqlString, values);

		results = await sqlAsync.query(req.db, sqlString);

		if (results[0].adminAvail - amount < 0) throw Error(`account[${req.user.account}] role[${req.user.role}] transfer cash[${amount}] from sender role[${role}] roleId[${roleId}], but has not enough admin availbalnce[${results[0].adminAvail}]`);
	}
	else {
		// Invalid role
		throw Error('invalid role');
	}
}

function autoTransferUploadValidator() {
	return [
		body('data[*].*')
			.isString().withMessage('Wrong data format'),

		body('transPwd')
			.isString().withMessage('Wrong data format')
			.isLength({ min: 1 }).withMessage('交易密碼不可爲空')
			.isLength({ max: 20 }).withMessage('交易密碼長度不可超過 20')
			.isAlphanumeric().withMessage('交易密碼只能含有數字或英文字母'),

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

		body('data[*].轉出帳號')
			.isLength({ min: 1 }).withMessage('帳號不可爲空')
			.isLength({ max: 20 }).withMessage('帳號長度不可超過 20')
			.isAlphanumeric().withMessage('帳號只能含有數字或英文字母'),

		body('data[*].轉入帳號')
			.isLength({ min: 1 }).withMessage('帳號不可爲空')
			.isLength({ max: 20 }).withMessage('帳號長度不可超過 20')
			.isAlphanumeric().withMessage('帳號只能含有數字或英文字母'),

		body('data[*].數量')
			.isInt({ min: 0, max: 99999999999 }).withMessage('轉帳數量必須介於 0 ～ 99999999999 之間的整數'),

		body('data[*].備註')
			.isLength({ min: 0, max: 40 }).withMessage('備註長度不可超過 40'),

		sanitizeBody('data[*]')
			.escape()
			.trim(),
	];
}

module.exports = {
	render: autoTransferRenderHandler,
	upload: autoTransferUploadHandler,
	uploadValidate: autoTransferUploadValidator(),
};