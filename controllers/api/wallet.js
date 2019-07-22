const
	{ body, validationResult } = require('express-validator/check'),
	{ sanitizeBody } = require('express-validator/filter'),
	emoji = require('node-emoji'),
	mysql = require('mysql'),
    moment = require('moment'),
    util = require('../../libs/util'),
	sqlAsync = require('../../libs/sqlAsync'),
	notification = require('../../libs/notification');


let listHandler = async function (req, res, next) {
	let sqlString = `   SELECT U.GSCash AS availBalance
                        FROM UserAccount AS U
                        WHERE U.id=?;`;
	let values = [req.user.id];
	sqlString = mysql.format(sqlString, values);
	let mainCurrency = []; 
	try {
		mainCurrency = await sqlAsync.query(req.db, sqlString);
	} catch (error) {
		req.logger.error(`${error.message}`);
		return res.json({ errCode: 2, msg: 'Server錯誤' });
	}
	mainCurrency[0].storeId = -1;
	mainCurrency[0].currencyName = '魂幣';
    mainCurrency[0].storeName = '聯盟';
    mainCurrency[0].exchangeRate = 1;
	mainCurrency[0].inflow = 1;
	mainCurrency[0].outflow = 1;
	sqlString = `
					  SELECT 
						  Store.id AS storeId, Store.currencyName AS currencyName, Mem.availBalance AS availBalance, U.name AS storeName,
						  Store.exchangeRate AS exchangeRate, Store.inflow AS inflow, Store.outflow AS outflow,
						  Store.currencySrc AS currencySrc
                      FROM StoreInfo AS Store
                      INNER JOIN UserAccount AS U
                            ON Store.uid = U.id
                      INNER JOIN AgentInfo AS Ag
                          ON Ag.storeId=Store.id
                      INNER JOIN MemberInfo AS Mem
                          ON Mem.agentId=Ag.id
                      WHERE Mem.uid=?
                  `;
	values = [req.user.id];
	sqlString = mysql.format(sqlString, values);

	let walletList = [];
	try {
		walletList = await sqlAsync.query(req.db, sqlString);
	} catch (error) {
		req.logger.error(`${error.message}`);
		return res.json({ errCode: 2, msg: 'Server 錯誤' });
	}
	let walletData = mainCurrency.concat(walletList);
	return res.json({ errCode: 0, msg: 'success', data: walletData });
};

let transferHandler = async function (req, res, next) {
	const result = validationResult(req);

	// If the form data is invalid
	if (!result.isEmpty()) {
		// Return the first error to client
		let firstError = result.array()[0].msg;
		return res.json({ errCode: 1, msg: firstError });
	}

	// Gather data
	let
		{
			storeId,
			accountTo,
			amount,
            comment, } = req.body;
    storeId = Number(storeId);
    amount = Number(amount);

	// get sqlString for two case each
	let sqlString, sender, receiver, currencyName;
	if (storeId === -1) {
		// get reciever's data
		currencyName = '魂幣';
		let userList;
		try {
			userList = await getUserList(req);
		}
		catch (error) {
			req.logger.error(`${error.message}`);
			return res.json({ errCode: 2, msg: 'Server錯誤' });
		}

		sender = userList.find(row => (row.account === req.user.account));
		if (!sender) return res.json({ errCode: 1, msg: '轉帳無效' });

		receiver = userList.find(row => (row.account === accountTo));
		if (!receiver) return res.json({ errCode: 1, msg: '轉帳無效' });

		try {
			await validateMainTransSender(req, amount);
		}
		catch (error) {
			req.logger.error(`${error.message}`);
			return res.json({ errCode: 1, msg: '可用餘額不足' });
		}

		sqlString = getMainTransferString(sender, receiver, amount, comment);
	}
	else {
		// get currencyName
		let storeSql = `SELECT store.currencyName
						FROM StoreInfo AS store
						WHERE store.id = ?;`;
		let values = [storeId];
		storeSql = mysql.format(storeSql, values);
		let results;
		try {
			results = await sqlAsync.query(req.db, storeSql);
		}
		catch (error) {
			req.logger.error(`${error.message}`);
			return res.json({ errCode: 2, msg: 'Server 錯誤' });
		}
		currencyName = results[0].currencyName;
		// Gather all acount this member can transfer to
		let availAccounts;
		try {
			availAccounts = await getAvailUsers(req, storeId);
		}
		catch (error) {
			req.logger.error(`${error.message}`);
			return res.json({ errCode: 2, msg: 'Server 錯誤' });
        }

		sender = availAccounts.find(row => (row.account === req.user.account));
		if (!sender) return res.json({ errCode: 1, msg: '轉帳無效' });

		// If accountTo is not found, then receiver is invalid
		receiver = availAccounts.find(row => (row.account === accountTo));
		if (!receiver) return res.json({ errCode: 1, msg: '轉帳無效' });

		// Check sender's avail balance 
		try {
			await validateTransSender(req, sender.role, sender.roleId, amount);
		} catch (error) {
			req.logger.error(`${error.message}`);
			return res.json({ errCode: 1, msg: '可用餘額不足' });
		}

		sqlString = getStoreTransferString(sender, receiver, amount, storeId, comment);
	}

	// Execute transaction
	// Transfer cash
	try {
		await sqlAsync.query(req.db, 'START TRANSACTION');
        await sqlAsync.query(req.db, sqlString);
	}
	catch (error) {
		await sqlAsync.query(req.db, 'ROLLBACK'); // rollback transaction if a statement produce error
		req.logger.error(`${error.message}`);
		return res.json({ errCode: 2, msg: 'Server 錯誤' });
	}
	await sqlAsync.query(req.db, 'COMMIT');  // commit transaction only if all statement has executed without error

	// Log
	req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] transfer Currency[${storeId}] cash[${amount}] from account[${sender.account}] role[${sender.role}] to account[${receiver.account}] role[${receiver.role}]`);

	// send notification
	let content = `收到來自 ${sender.name} 的 ${currencyName} ${amount}`;
	let targetUid = [receiver.uid];
	try{
		await notification.createNotification(req, req.user.id, targetUid, content);
	}
	catch (error) {
		req.logger.error(`${error.message}`);
	}

	return res.json({ errCode: 0, msg: 'success' });

};

let historyHandler = async function (req, res, next) {
    const result = validationResult(req);

	// If the form data is invalid
	if (!result.isEmpty()) {
		// Return the first error to client
		let firstError = result.array()[0].msg;
		return res.json({ errCode: 1, msg: firstError });
    }

	// Gather data
	let {
		storeId,
		startTime,
        endTime, } = req.body;
    storeId = Number(storeId);

	let sqlString, values, results = [];
	if (storeId === -1) {
		let timeString = mysql.format(`AND (MT.createtime BETWEEN ? AND ?)`, [startTime, endTime]);
		sqlString = `SELECT 
                        U.account, U.name, U.role, 
                        MT.id AS tid, MT.transTypeCode, MT.amount, MT.relatedName, MT.comment, 
                        DATE_FORMAT(CONVERT_TZ(MT.createtime, 'UTC', 'Asia/Shanghai'),'%Y-%m-%d %H:%i:%s ') AS createtime
                    FROM UserAccount AS U
                    INNER JOIN MainTransaction AS MT
                        ON MT.uid=U.id
                    WHERE U.id=? ${timeString}
                    `;
		values = [req.user.id];
        sqlString = mysql.format(sqlString, values);
	}
	else {
		// prepare sql string
		let timeString = mysql.format(`AND (ST.createtime BETWEEN ? AND ?)`, [startTime, endTime]);
		// Get the transaction info of the user
		sqlString = `SELECT 
                        U.account, U.name, U.role, 
                        ST.id AS tid, ST.transTypeCode, ST.amount, ST.relatedName, ST.comment, store.currencyName,
                        DATE_FORMAT(CONVERT_TZ(ST.createtime, 'UTC', 'Asia/Shanghai'),'%Y-%m-%d %H:%i:%s ') AS createtime
                    FROM UserAccount AS U
                    INNER JOIN StoreTransaction AS ST
                        ON ST.uid=U.id
                    INNER JOIN StoreInfo AS store
                        ON ST.storeId = store.id
                    WHERE U.id=? AND store.id=? ${timeString} 
                    `;
		values = [req.user.id, storeId];
		sqlString = mysql.format(sqlString, values);
	}

	// Add limit 
	sqlString += ` ORDER BY createtime desc LIMIT 20000;`;
	// Execute query
	try {
		results = await sqlAsync.query(req.db, sqlString);
	}
	catch (error) {
		req.logger.error(`${error.message}`);
		return res.json({ errCode: 2, msg: 'Server 錯誤' });
	}

	// Emojify, the relatedName field might contain emoji(from DpqAccount name)
	results.forEach(function (row) {
		row.relatedName = emoji.emojify(row.relatedName);
	});

	// filter the exchange record 
	let historyData = results;

	// Return data
	return res.json({ errCode: 0, msg: 'success', data: historyData });
};

let exchangeHandler = async function (req, res, next) {

	const result = validationResult(req);

	// If the form data is invalid
	if (!result.isEmpty()) {
		// Return the first error to client
		let firstError = result.array()[0].msg;
		return res.json({ errCode: 1, msg: firstError });
	}

	// Gather all required data
	let
		{
			outflowStoreId,
			inflowStoreId,
			amount,
			comment, } = req.body;

	// Convert from string
	amount = Number(amount);
	outflowStoreId = Number(outflowStoreId);
	inflowStoreId = Number(inflowStoreId);
	let transTypeOptionCode;
	// check optionType
	if(outflowStoreId === -1 && inflowStoreId !== -1) {
		transTypeOptionCode = 1;
	} else if (inflowStoreId === -1 && outflowStoreId !== -1) {
		transTypeOptionCode = 0;
	} else {
		transTypeOptionCode = 2;
	}

	// Get memberInfo
	let results, inflowMemInfo, outflowMemInfo, values;
	let memberInfoString = `SELECT 
							U.id AS uid, U.account, U.GSCash, U.name,
							Mem.id AS memId
						FROM UserAccount AS U
						INNER JOIN MemberInfo AS Mem
							ON Mem.uid = U.id
						INNER JOIN AgentInfo AS Ag
							ON Mem.agentId = Ag.id
						WHERE U.id=? AND Ag.storeId=?
					;`;
	if(inflowStoreId !== -1) {
		values = [req.user.id, inflowStoreId];
		let inflowMemInfoString = mysql.format(memberInfoString, values);
		try {
			results = await sqlAsync.query(req.db, inflowMemInfoString);
		} catch (error) {
			req.logger.error(`${error.message}`);
			return res.json({errCode: 1, msg: '轉換無效'});
		}
		inflowMemInfo = results[0];
    }
	if(outflowStoreId !== -1) {
		values = [req.user.id, outflowStoreId];
        let outflowMemInfoString = mysql.format(memberInfoString, values);
		try {
			results = await sqlAsync.query(req.db, outflowMemInfoString);
		} catch (error) {
			req.logger.error(`${error.message}`);
			return res.json({ errCode: 1, msg: '轉換無效'});
		}
		outflowMemInfo = results[0];
    }

	// Get storeInfo
	let inflowStore, outflowStore;
	let storeString = `	SELECT U.id AS uid, U.account, U.GSCash, U.name, store.id, store.exchangeRate
						FROM UserAccount AS U
						INNER JOIN StoreInfo AS store
							ON store.uid = U.id
						WHERE store.id=?;
					`;
	if(inflowStoreId !== -1) {
		values = [inflowStoreId];
		let inflowStoreString = mysql.format(storeString, values);
		try {
			results = await sqlAsync.query(req.db, inflowStoreString);
		} catch (error) {
			req.logger.error(`${error.message}`);
			return res.json({ errCode: 1, msg: '轉換無效'});
		}
		inflowStore = results[0];
	}
	if(outflowStoreId !== -1) {
		values = [outflowStoreId];
		let outflowStoreString = mysql.format(storeString, values);
		try {
			results = await sqlAsync.query(req.db, outflowStoreString);
		} catch (error) {
			req.logger.error(`${error.message}`);
			return res.json({ errCode: 1, msg: '轉換無效'});
		}
		outflowStore = results[0];
	}
	

	// Check sender's & store's avail balance 
	try {
		await validateExchange(req, inflowMemInfo, outflowMemInfo, amount, transTypeOptionCode, inflowStore, outflowStore);
	} catch (error) {
		req.logger.error(`${error.message}`);
		return res.json({ errCode: 1, msg: '可用餘額不足' });
    }
    
    // get adminInfo
	let adminInfo;
	let adminInfoString = `SELECT U.id AS uid, U.name
							FROM UserAccount AS U
							INNER JOIN AdminInfo AS Adm
								ON Adm.uid=U.id
							WHERE Adm.id=0;`;
	try {
		results = await sqlAsync.query(req.db, adminInfoString);
	} catch (error) {
		req.logger.error(`${error.message}`);
		return res.json({ errCode: 1, msg: '轉換無效'});
	}
	adminInfo = results[0];

	// get query string
	let inflowsqlString='', outflowsqlString='';
	if(inflowStoreId !== -1) {
		inflowsqlString = getExchangeString(req, inflowMemInfo, amount, 1, inflowStore, adminInfo, comment);
	}
	if(outflowStoreId !== -1) {
		outflowsqlString = getExchangeString(req, outflowMemInfo, amount, 0, outflowStore, adminInfo, comment);
	}
	let sqlString = outflowsqlString + inflowsqlString;
	// Execute transaction
	// Transfer cash
	try {
		await sqlAsync.query(req.db, 'START TRANSACTION');
		await sqlAsync.query(req.db, sqlString);
	}
	catch (error) {
		await sqlAsync.query(req.db, 'ROLLBACK'); // rollback transaction if a statement produce error
		req.logger.error(`${error.message}`);
		return res.json({ errCode: 2, msg: 'Server 錯誤' });
	}
	await sqlAsync.query(req.db, 'COMMIT');  // commit transaction only if all statement has executed without error

	// Log
	if(transTypeOptionCode === 0){
		req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] exchange storeCurrency[${outflowStoreId}] to mainCurrency amount[${amount}] `);
	}
	else if(transTypeOptionCode === 1){
		req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] exchange mainCurrency to storeCurrency[${inflowStoreId}] amount[${amount}]`);
	}
	else if(transTypeOptionCode === 2){
		req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] exchange storeCurrency[${outflowStoreId} to storeCurrency[${inflowStoreId}] amount[${amount}]]`);
	}

	return res.json({ errCode: 0, msg: 'success' });
}


// Get avail account this member can transfer to
// Include all the members in this store
// This member's agent, store
async function getAvailUsers(req, storeId) {
	// Prepare query
	let sqlString, values, results;
	// First. get this member's agentId
	sqlString = `	SELECT Mem.agentId
					FROM MemberInfo AS Mem
					INNER JOIN AgentInfo AS Ag
						ON Mem.agentId = Ag.id
					WHERE Mem.uid=? AND Ag.storeId=?;`;
	values = [req.user.id, storeId];
	sqlString = mysql.format(sqlString, values);
	results = await sqlAsync.query(req.db, sqlString);

	let agentId = results[0].agentId;

	// Second. get avail account
	sqlString = `(
					SELECT U.account, U.role, U.id AS uid, U.name, Mem.id AS roleId
					FROM MemberInfo AS Mem
					INNER JOIN UserAccount AS U
						ON Mem.uid = U.id
                    INNER JOIN AgentInfo AS Ag
                        ON Mem.agentId = Ag.id
                    WHERE Ag.storeId=?
				)
				UNION
				(
					SELECT U.account, U.role, U.id AS uid, U.name, Ag.id AS roleId
					FROM AgentInfo AS Ag
					INNER JOIN UserAccount AS U
						ON Ag.uid = U.id
					WHERE Ag.id=?
				)
				UNION
				(
					SELECT U.account, U.role, U.id AS uid, U.name, store.id AS roleId
					FROM StoreInfo AS store
					INNER JOIN UserAccount AS U
						ON store.uid = U.id
					WHERE store.id=?
				);`;
	values = [storeId, agentId, storeId];
	sqlString = mysql.format(sqlString, values);

	// Execute query
	results = await sqlAsync.query(req.db, sqlString);

	return results;
}

async function getUserList(req) {
	// Prepare query
	let sqlString, results;

	sqlString = `SELECT U.account, U.role, U.id AS uid, U.name
                FROM UserAccount AS U;`;
	results = await sqlAsync.query(req.db, sqlString);

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
	else {
		// Invalid role
		throw Error('invalid role');
	}
}

async function validateMainTransSender(req, amount) {
	// Prepare query
	let sqlString, values, results;

	if (req.user.role === 'member') {
		sqlString = `SELECT U.GSCash
                    FROM UserAccount AS U
                    WHERE U.id=?;`;
		values = [req.user.id];
		sqlString = mysql.format(sqlString, values);

		results = await sqlAsync.query(req.db, sqlString);

		if (results[0].GSCash - amount < 0) throw Error(`account[${req.user.account}] role[${req.user.role}] transfer GSCash[${amount}] from sender role[${req.user.role}] roleId[${req.user.id}], but has not enough GSCash[${results[0].GSCash}]`);
	}
	else {
		// Invalid role
		throw Error('invalid role');
	}
}

// Validate sender's transaction
// Given role and role id 
// Check transfer amount against sender's avail balance
// Please execute it in try catch 
async function validateExchange(req, inflowMemInfo, outflowMemInfo, amount, transTypeOptionCode, inflowStore, outflowStore) {

	// Prepare query
	let sqlString, values, results;

	if(transTypeOptionCode === 0 || transTypeOptionCode === 2){
		// store to Main
		// check store MainCurrency avail
		sqlString = ` 	SELECT U.GSCash
						FROM UserAccount AS U
						INNER JOIN StoreInfo AS store
							ON store.uid = U.id
						WHERE store.id=?
					;`;
		values = [outflowStore.id];
		sqlString = mysql.format(sqlString, values);

		results = await sqlAsync.query(req.db, sqlString);

        if(results[0].GSCash - amount < 0) throw Error(`account[${req.user.account}] exchange storeCurrency[${outflowStore.id}] to mainCurrency amount[${amount}] but store mainCurrency not enough`);

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
		values = [outflowMemInfo.memId];
		sqlString = mysql.format(sqlString, values);

        results = await sqlAsync.query(req.db, sqlString);
        let outflowAmount = Math.ceil(amount * outflowStore.exchangeRate);

		if (results[0].cash - outflowAmount < 0) throw Error(`account[${req.user.account}] exchange storeCurrency[${outflowStore.id}] to mainCurrency amount[${amount}] but memberAvail not enough`);
		if (results[0].agentAvail - outflowAmount < 0) throw Error(`account[${req.user.account}] exchange storeCurrency[${outflowStore.id}] to mainCurrency amount[${amount}] but agentAvail not enough`);
		if (results[0].storeAvail - outflowAmount < 0) throw Error(`account[${req.user.account}] exchange storeCurrency[${outflowStore.id}] to mainCurrency amount[${amount}] but storeAvail not enough`);
		if (results[0].adminAvail - outflowAmount < 0) throw Error(`account[${req.user.account}] exchange storeCurrency[${outflowStore.id}] to mainCurrency amount[${amount}] but adminAvail not enough`);

	}
	else if(transTypeOptionCode === 1){
		// Main to store
		// check member Main Currency avail
		sqlString = `	SELECT U.GSCash
						FROM UserAccount AS U
						WHERE U.account=?
					;`;
		values = [inflowMemInfo.account];
		sqlString = mysql.format(sqlString, values);

		results = await sqlAsync.query(req.db, sqlString);

		if(results[0].GSCash - amount < 0) throw Error(`account[${req.user.account}] exchange mainCurrency to storeCurrency[${outflowStore.id}] amount[${amount}] but member mainCurrency not enough`);
	}
	else{
		// Invalid transTypeOptionCode
		throw Error('invalid transTypeOptionCode');
	}

}

function getStoreTransferString(sender, receiver, amount, storeId, comment) {

	// Determine update table for sender and receiver 
	sender.table = util.roleToTable(sender.role);
	receiver.table = util.roleToTable(receiver.role);

	// Determine transTypeCode
	//let transTypeData = transTypeOptions.find((element) => (element.code === transTypeOptionCode));
	sender.transTypeCode = 0;
	receiver.transTypeCode = 1;

	// Prepare query
	// Query for update sender
	let sqlStringSender = `UPDATE ??
                            SET cash=cash-?
                            WHERE id=?
                            ;`;
	let values = [sender.table, amount, sender.roleId];
	sqlStringSender = mysql.format(sqlStringSender, values);
	// Query for update receiver
	let sqlStringReceiver = `UPDATE ??
                            SET cash=cash+?
                            WHERE id=?
                            ;`;
	values = [receiver.table, amount, receiver.roleId];
	sqlStringReceiver = mysql.format(sqlStringReceiver, values);

	// Query for transaction record
	let sqlStringRecord1 = `INSERT INTO StoreTransaction 
        (uid, transTypeCode, amount, relatedId, relatedName, storeId, comment)
        VALUES (?, ?, ?, ?, ?, ?, ?);`;
	values = [sender.uid, sender.transTypeCode, amount * -1, receiver.uid, receiver.name, storeId, comment];
	sqlStringRecord1 = mysql.format(sqlStringRecord1, values);

	let sqlStringRecord2 = `INSERT INTO StoreTransaction 
        (uid, transTypeCode, amount, relatedId, relatedName, storeId, comment)
        VALUES (?, ?, ?, ?, ?, ?, ?);`;
	values = [receiver.uid, receiver.transTypeCode, amount, sender.uid, sender.name, storeId, comment];
	sqlStringRecord2 = mysql.format(sqlStringRecord2, values);

	let returnString = sqlStringSender + sqlStringReceiver + sqlStringRecord1 + sqlStringRecord2;

	return returnString;
}

function getMainTransferString(sender, receiver, amount, comment) {
	let sqlStringSender = `UPDATE UserAccount
                            SET GSCash=GSCash-?
                            WHERE id=?;`;
	let values = [amount, sender.uid];
	sqlStringSender = mysql.format(sqlStringSender, values);

	let sqlStringReceiver = `UPDATE UserAccount
                            SET GSCash=GSCash+?
                            WHERE id=?;`;
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

	let returnString = sqlStringSender + sqlStringReceiver + sqlStringRecord1 + sqlStringRecord2;
	return returnString;

}

function getExchangeString(req, sender, amount, transTypeOptionCode, targetStore, adminInfo, comment) {
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
							WHERE id=0;
						`;
		values = [storeCurrencyAmount];
		sqlString4 = mysql.format(sqlString4, values);


		let sqlStringRecord3 = `INSERT INTO StoreTransaction 
								(uid, transTypeCode, amount, relatedId, relatedName, storeId, comment)
								VALUES (?, ?, ?, ?, ?, ?, ?);`;
		values = [sender.uid, 7, -1*storeCurrencyAmount, adminInfo.uid, adminInfo.name, targetStore.id, '兌換'];
		sqlStringRecord3 = mysql.format(sqlStringRecord3, values);

		let sqlStringRecord4 = `INSERT INTO StoreTransaction 
								(uid, transTypeCode, amount, relatedId, relatedName, storeId, comment)
								VALUES (?, ?, ?, ?, ?, ?, ?);`;
		values = [adminInfo.uid, 7, storeCurrencyAmount, sender.uid, sender.name, targetStore.id, '兌換'];
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
							WHERE id=0;
						`;
		values = [storeCurrencyAmount];
		sqlString4 = mysql.format(sqlString4, values);

		let sqlStringRecord3 = `INSERT INTO StoreTransaction 
								(uid, transTypeCode, amount, relatedId, relatedName, storeId, comment)
								VALUES (?, ?, ?, ?, ?, ?, ?);`;
		values = [sender.uid, 6, storeCurrencyAmount, adminInfo.uid, adminInfo.name, targetStore.id, '兌換'];
		sqlStringRecord3 = mysql.format(sqlStringRecord3, values);

		let sqlStringRecord4 = `INSERT INTO StoreTransaction 
								(uid, transTypeCode, amount, relatedId, relatedName, storeId, comment)
								VALUES (?, ?, ?, ?, ?, ?, ?);`;
		values = [adminInfo.uid, 6, -1*storeCurrencyAmount, sender.uid, sender.name, targetStore.id, '兌換'];
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
function transferValidator() {
	return [
		// All values must be string
		body('*')
			.isString().withMessage('Wrong data format'),

		// For each in data array
		body('storeId')
			.isLength({ min: 1 }).withMessage('storeId 不可爲空')
			.isLength({ max: 200 }).withMessage('storeId 長度不可超過 200')
			.isInt({ min: -1 }).withMessage('storeId必須是數字'),

		body('accountTo')
			.isLength({ min: 1 }).withMessage('帳號不可爲空')
			.isLength({ max: 20 }).withMessage('帳號長度不可超過 20')
			.isAlphanumeric().withMessage('帳號只能含有數字或英文字母')
			.custom(function (data, { req }) { return data !== req.user.account; }).withMessage('轉入帳號不能跟轉出帳號相同'),

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

		// Check if the storeId correct
		// Check if the member can do Transfer (only check when user role is member)
		body('storeId').custom(async function(data, { req }) {
			// Prepare query
			let storeId = Number(data);
			if(storeId === -1) return true;
			let sqlString = `SELECT store.memberTransfer
							FROM StoreInfo AS store
							WHERE store.id=?;
							`;
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
			if (results.length <= 0) throw Error('店家代碼錯誤');

			if(req.user.role === 'member' && results[0].memberTransfer === 0) throw Error('轉帳無效');

			return true;
		}),

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

	];
}

function historyValidator() {
	return [
		// All values must be string
		body('*')
			.isString().withMessage('Wrong data format'),

		// For each in data array
		body('storeId')
			.isLength({ min: 1 }).withMessage('storeId 不可爲空')
			.isLength({ max: 200 }).withMessage('storeId 長度不可超過 200')
			.isInt({ min: -1 }).withMessage('storeId必須是數字'),

        body('startTime')
            .isLength({ max: 40 }).withMessage('時間長度不可超過 40'),

        body('endTime')
            .isLength({ max: 40 }).withMessage('時間長度不可超過 40')
            .custom(function(data, { req }){
                let re = /^\d\d\d\d-(0?[1-9]|1[0-2])-(0?[1-9]|[12][0-9]|3[01]) (00|0[0-9]|[0-9]|1[0-9]|2[0-3]):([0-9]|[0-5][0-9])$/;
                let d = req.body.endTime.trim();
                if (!d.match(re)) {
                    throw Error(`時間格式錯誤`);
                }
                d = req.body.startTime.trim();
                if (!d.match(re)) {
                    throw Error(`時間格式錯誤`);
                }

                let startTime = moment(req.body.startTime.trim(), 'YYYY/MM/DD HH:mm');
				let endTime = moment(req.body.endTime.trim(), 'YYYY/MM/DD HH:mm');
				let days = endTime.diff(startTime, 'days');
				if (days > 60) throw Error(`搜尋天數超過 60 天`);

				return true;
            }),
            
		// Sanitize all values 
		sanitizeBody('*')
			.escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
			.trim(), // trim white space from both end 

	];
}

function exchangeValidator() {
	return [
		// Check format
		// All values must be string
		body('*')
			.isString().withMessage('Wrong data format'),

        body('outflowStoreId')
			.isLength({ min: 1 }).withMessage('轉出幣別代碼不可爲空')
			.isLength({ max: 200 }).withMessage('轉出幣別代碼長度不可超過 200')
			.isInt({ min: -1 }).withMessage('轉出幣別代碼必須是數字'),

		body('inflowStoreId')
			.isLength({ min: 1 }).withMessage('轉入幣別代碼不可爲空')
			.isLength({ max: 200 }).withMessage('轉入幣別代碼長度不可超過 200')
            .isInt({ min: -1 }).withMessage('轉入幣別代碼必須是數字'),
            
		body('amount')
			.isInt({ min: 1, max: 99999999999 }).withMessage('兌換數量必須介於 1 ～ 99999999999 之間的整數'),
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

		body('outflowStoreId').custom(async function (data, { req }) {
 
			// doesn't need to check mainCurrency
			if(Number(data) === -1) return true;

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
			
			if(results[0].outflow === 0){
				throw Error('該店家不支援此轉換');
			}
			
			return true;
		}),

		body('inflowStoreId').custom(async function (data, { req }) {
 
			// doesn't need to check mainCurrency
			if(Number(data) === -1) return true;

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
			
			if(results[0].inflow === 0){
				throw Error('該店家不支援此轉換');
			}
			
			return true;
		}),
	];
}

module.exports = {
	list: listHandler,
	transfer: transferHandler,
	transferValidate: transferValidator(),
    history: historyHandler,
	historyValidate: historyValidator(),
	exchange: exchangeHandler,
	exchangeValidate: exchangeValidator(),
};
