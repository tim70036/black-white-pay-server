const
    { body, validationResult } = require('express-validator/check'),
    { sanitizeBody } = require('express-validator/filter'),
    mysql = require('mysql'),
    sqlAsync = require('../../../libs/sqlAsync');

// Must block: if the number before exchange and after exchage <= 0 in take-in
// However we cannot block if the number after exchange <= 0 in take-out
// Because user will need to change their currency, and need to take out whatever it happens

let takeInHandler = async function(req, res, next) {
    const result = validationResult(req);

	// If the form data is invalid
	if (!result.isEmpty()) {
		// Return the first error to client
		let firstError = result.array()[0].msg;
		return res.json({ errCode: 1, msg: firstError });
    }

    // Gather all required data
    let {
        gameId,
        storeId,
        amount,
    } = req.body;

    // Convert data
    amount = Number(amount);
    storeId = Number(storeId);

    // Prepare query
    let sqlString = `
                        SELECT
                            Mem.id AS id,
                            Mem.availBalance AS memberAvail,
                            Ab.totalAvail AS agentAvail,
                            Ab.id AS agentId,
                            Sb.totalAvail AS storeAvail,
                            Store.exchangeRate AS exchangeRate,
                            Sb.id AS storeId,
                            Admb.totalAvail AS adminAvail
                        FROM MemberInfo AS Mem
                        INNER JOIN AgentBalance AS Ab
                            ON Mem.agentId=Ab.id
                        INNER JOIN StoreBalance AS Sb
                            ON Ab.storeId=Sb.id
                        INNER JOIN StoreInfo AS Store
                            ON Sb.id=Store.id
                        INNER JOIN AdminBalance AS Admb
                            ON Sb.adminId=Admb.id
                        WHERE Mem.uid=? AND Sb.id=?
                        ;
                        SELECT
                            UGW.id AS id,
                            UGW.uid AS uid,
                            UGW.gameId AS gameId,
                            UGW.agentId AS agentId,
                            UGW.storeId AS storeId,
                            UGW.balance AS balance,
                            UGW.frozenBalance AS frozenBalance,
                            G.name AS gameName,
                            Store.exchangeRate AS exchangeRate
                        FROM UserGameWallet AS UGW
                        INNER JOIN GameInfo AS G
                            ON UGW.gameId=G.id
                        INNER JOIN StoreInfo AS Store
                            ON UGW.storeId=Store.id
                        WHERE UGW.uid=? AND UGW.gameId=?
                        ;
                    `;
    let values = [req.user.id, storeId, req.user.id, gameId];
    sqlString = mysql.format(sqlString, values);

    // Get user wallet info and game wallet info
    let results;
    let userWalletInfo;
    let userGameWalletInfo = null;
    try {
        results = await sqlAsync.query(req.db, sqlString);

        if (results.length < 2 || results[0].length <= 0) throw Error(`cannot get user wallet info uid[${req.user.id}] storeId[${storeId}]`);

        // User wallet info
        userWalletInfo = results[0][0];

        // User game wallet exists
        if (results[1].length > 0) {
            userGameWalletInfo = results[1][0];
        }
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({ errCode : 2, msg: 'Server 錯誤' });
    }
    
    // Check avail balance
    if (userWalletInfo.memberAvail - amount < 0 || userWalletInfo.agentAvail - amount < 0 || userWalletInfo.storeAvail - amount < 0 || userWalletInfo.adminAvail - amount < 0) 
        return res.json({ errCode: 1, msg: '可用餘額不足' });
    
    // Calculate store currency amount into (TWD)
    // Check if amount <= 0
    let gameWalletAmount = Math.floor(amount / userWalletInfo.exchangeRate);
    if (gameWalletAmount <= 0) return res.json({ errCode: 1, msg: '攜入數量不足' });
    
    let sqlStrings = ``;
    let hasTakeOut = false; // for log

    // Prepare query based on current state of game wallet
    if (userGameWalletInfo !== null) {
        // Different currency and agent, need take-out first
        if (userGameWalletInfo.storeId !== userWalletInfo.storeId || userGameWalletInfo.agentId !== userWalletInfo.agentId) {
            // Check if there is unresolve game
            if (userGameWalletInfo.frozenBalance > 0)   return res.json({ errCode: 1, msg: '遊戲尚未結算，無法攜入不同幣別' });

            // Only take out if the balance > 0
            if (userGameWalletInfo.balance > 0) {
                sqlStrings += getTakeOutString(userGameWalletInfo);
                hasTakeOut = true; // for log
            }
        } 

        // Game wallet exists, just add it
        let sqlStringUpdate = ` UPDATE UserGameWallet
                                SET 
                                    agentId=?,
                                    storeId=?,
                                    balance=balance+?
                                WHERE id=?
                                ;
                            `;
        values = [userWalletInfo.agentId, userWalletInfo.storeId, gameWalletAmount, userGameWalletInfo.id];
        sqlStrings += mysql.format(sqlStringUpdate, values);
    } else {
        // Game wallet doesn't exist, create a new one
        let sqlStringInsert = ` INSERT INTO UserGameWallet (uid, gameId, agentId, storeId, balance)
                                VALUES (?, ?, ?, ?, ?);`;
        values = [req.user.id, gameId, userWalletInfo.agentId, userWalletInfo.storeId, gameWalletAmount];
        sqlStrings += mysql.format(sqlStringInsert, values);
    }

    // The rest are the same
    // Deduct from user wallet and insert transaction record
    let sqlStringUpdate = ` UPDATE MemberInfo
                            SET cash=cash-?
                            WHERE id=?
                            ;
                        `;
    values = [amount, userWalletInfo.id];
    sqlStrings += mysql.format(sqlStringUpdate, values);

    let sqlStringTrans1 = ` INSERT INTO GameTransaction
                            (uid, transTypeCode, amount, gameId)
                            VALUES (?, ?, ?, ?);`;
    values = [req.user.id, 4, gameWalletAmount, gameId];
    sqlStrings += mysql.format(sqlStringTrans1, values);

    let sqlStringTrans2 = ` INSERT INTO StoreTransaction 
                            (uid, transTypeCode, amount, relatedId, relatedName, storeId, comment)
                            VALUES (?, ?, ?, ?, (SELECT name FROM GameInfo WHERE id=?), ?, ?);`;
    values = [req.user.id, 4, amount * -1, gameId, gameId, userWalletInfo.storeId, ''];
    sqlStrings += mysql.format(sqlStringTrans2, values);

    // Execute transaction
	// Take in
	try {
		await sqlAsync.query(req.db, 'START TRANSACTION');
		await sqlAsync.query(req.db, sqlStrings);
	}
	catch (error) {
		await sqlAsync.query(req.db, 'ROLLBACK'); // rollback transaction if a statement produce error
		req.logger.error(`${error.message}`);
		return res.json({ errCode: 2, msg: 'Server 錯誤' });
	}
	await sqlAsync.query(req.db, 'COMMIT');  // commit transaction only if all statement has executed without error

    // Log
    if (hasTakeOut) req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] take-out game wallet gameId[${gameId}] storeCurrency[${userGameWalletInfo.storeId}] balance[${userGameWalletInfo.balance}]`);
    req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] take-in storeCurrency[${storeId}] amount[${amount}] into gameId[${gameId}] amount[${gameWalletAmount}]`);

    return res.json({ errCode: 0, msg: 'success' });
}

let takeOutHandler = async function(req, res, next) {
    const result = validationResult(req);

	// If the form data is invalid
	if (!result.isEmpty()) {
		// Return the first error to client
		let firstError = result.array()[0].msg;
		return res.json({ errCode: 1, msg: firstError });
    }

    // Gather all required data
    let {
        gameId,
    } = req.body;

    // Prepare query
    let sqlString = `
                        SELECT
                            UGW.id AS id,
                            UGW.uid AS uid,
                            UGW.gameId AS gameId,
                            UGW.agentId AS agentId,
                            UGW.storeId AS storeId,
                            UGW.balance AS balance,
                            UGW.frozenBalance AS frozenBalance,
                            G.name AS gameName,
                            Store.exchangeRate AS exchangeRate
                        FROM UserGameWallet AS UGW
                        INNER JOIN GameInfo AS G
                            ON UGW.gameId=G.id
                        INNER JOIN StoreInfo AS Store
                            ON UGW.storeId=Store.id
                        WHERE UGW.uid=? AND UGW.gameId=?
                        ;
                    `;
    let values = [req.user.id, gameId];
    sqlString = mysql.format(sqlString, values);

    // Get game wallet info
    let results;
    try {
        results = await sqlAsync.query(req.db, sqlString);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({ errCode : 2, msg: 'Server 錯誤' });
    }

    // Check if there is any moeny to take-out
    // If game wallet doesn't exist, it means user has never take-in before
    if (results.length <= 0 || results[0].balance <= 0) return res.json({ errCode : 1, msg: '數量為 0 不可攜出' });
    let userGameWalletInfo = results[0];

    // If frozen balance > 0, means there exists unresolve game
    if (userGameWalletInfo.frozenBalance > 0)   return res.json({ errCode: 1, msg: '遊戲尚未結算，無法攜出' });

    // Generate sql string
    let sqlStrings = getTakeOutString(userGameWalletInfo);

    // Execute transaction
	// Take out
	try {
		await sqlAsync.query(req.db, 'START TRANSACTION');
		await sqlAsync.query(req.db, sqlStrings);
	}
	catch (error) {
		await sqlAsync.query(req.db, 'ROLLBACK'); // rollback transaction if a statement produce error
		req.logger.error(`${error.message}`);
		return res.json({ errCode: 2, msg: 'Server 錯誤' });
	}
	await sqlAsync.query(req.db, 'COMMIT');  // commit transaction only if all statement has executed without error

    // Log
    req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] take-out game wallet gameId[${userGameWalletInfo.ganeId}] storeCurrency[${userGameWalletInfo.storeId}] balance[${userGameWalletInfo.balance}]`);

    return res.json({ errCode: 0, msg: 'success' });
}

// Generate sql string to return all balance in a game wallet
// Please provide exchange rate & game name
function getTakeOutString(userGameWalletInfo) {
    // Calculate TWD back into store currency amount
    let storeCurrencyAmount = Math.floor(userGameWalletInfo.balance * userGameWalletInfo.exchangeRate);
    
    // Need comment ?
    // if (storeCurrencyAmount <= 0) comment= ?

    let sqlStringUpdate1 = `    UPDATE UserGameWallet
                                SET balance=balance-?
                                WHERE id=?
                                ;
                            `;
    let values = [userGameWalletInfo.balance, userGameWalletInfo.id];
    sqlStringUpdate1 = mysql.format(sqlStringUpdate1, values);
    
    let sqlStringUpdate2 = `    UPDATE MemberInfo AS Mem
                                INNER JOIN AgentInfo AS Ag
                                    ON Mem.agentId = Ag.id
                                SET Mem.cash=Mem.cash+?
                                WHERE Mem.uid=? AND Ag.storeId=?
                                ;
                            `;
    values = [storeCurrencyAmount, userGameWalletInfo.uid, userGameWalletInfo.storeId];
    sqlStringUpdate2 = mysql.format(sqlStringUpdate2, values);

    let sqlStringTrans1 = ` INSERT INTO GameTransaction 
                            (uid, transTypeCode, amount, gameId)
                            VALUES (?, ?, ?, ?);`;
    values = [userGameWalletInfo.uid, 5, userGameWalletInfo.balance * -1, userGameWalletInfo.gameId];
    sqlStringTrans1 = mysql.format(sqlStringTrans1, values);

    let sqlStringTrans2 = ` INSERT INTO StoreTransaction 
                            (uid, transTypeCode, amount, relatedId, relatedName, storeId, comment)
                            VALUES (?, ?, ?, ?, ?, ?, ?);`;
    values = [userGameWalletInfo.uid, 5, storeCurrencyAmount, userGameWalletInfo.gameId, userGameWalletInfo.gameName, userGameWalletInfo.storeId, ''];
    sqlStringTrans2 = mysql.format(sqlStringTrans2, values);

    return sqlStringUpdate1 + sqlStringUpdate2 + sqlStringTrans1 + sqlStringTrans2;
}


// Form data validate generators
// Invoke it to produce a middleware for validating
function takeInValidator(){
    return [
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('gameId')
            .isLength({ min: 1 }).withMessage('遊戲代號不可爲空')
            .isLength({ max: 200 }).withMessage('遊戲代號不可超過 200')
            .isInt({ min: 0 }).withMessage('gameId 必須是數字'),
        body('storeId')
			.isLength({ min: 1 }).withMessage('storeId 不可爲空')
			.isLength({ max: 200 }).withMessage('storeId 長度不可超過 200')
			.isInt({ min: -1 }).withMessage('storeId 必須是數字'),
        body('amount')
			.isInt({ min: 1, max: 99999999999 }).withMessage('攜入數量必須介於 1 ～ 99999999999 之間的整數'),

        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 
        
        // Check gameId
        body('gameId').custom(async function(data, {req}){
            // Prepare query
            // Remeber to use charset utf8mb4_bin in DB
            let sqlString =`SELECT id
                            FROM GameInfo 
                            WHERE id=?`;
            let values = [data];
            sqlString = mysql.format(sqlString, values);

            // Check if duplicate account exists
            let results;
            try {
                results = await sqlAsync.query(req.db, sqlString);
            }
            catch(error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }

            if(results.length <= 0) throw Error('遊戲不存在');

            return true;
        }),

    ];
}

function takeOutValidator(){
    return [
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('gameId')
            .isLength({ min: 1 }).withMessage('遊戲代號不可爲空')
            .isLength({ max: 200 }).withMessage('遊戲代號不可超過 200')
            .isInt({ min: 0 }).withMessage('gameId 必須是數字'),

        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 
        
        // Check gameId
        body('gameId').custom(async function(data, {req}){
            // Prepare query
            // Remeber to use charset utf8mb4_bin in DB
            let sqlString =`SELECT id
                            FROM GameInfo 
                            WHERE id=?`;
            let values = [data];
            sqlString = mysql.format(sqlString, values);

            // Check if duplicate account exists
            let results;
            try {
                results = await sqlAsync.query(req.db, sqlString);
            }
            catch(error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }

            if(results.length <= 0) throw Error('遊戲不存在');

            return true;
        }),

    ];
}

module.exports = {
    takeIn: takeInHandler,
    takeInValidate: takeInValidator(),

    takeOut: takeOutHandler,
    takeOutValidate: takeOutValidator(),
};