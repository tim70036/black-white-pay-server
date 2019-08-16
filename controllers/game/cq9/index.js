const
    { body, param, validationResult } = require('express-validator/check'),
    { sanitizeBody } = require('express-validator/filter'),
    mysql = require('mysql'),
    moment = require('moment'),
    sqlAsync = require('../../../libs/sqlAsync');

const mtRedisPrefix = `game:cq9:record:`;
const mtRedisExpireTime = 72 * 60 * 60; // hour
const regexRFC3339 = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9]|60)(\.[0-9]+)?(Z|(\+|-)([01][0-9]|2[0-3]):([0-5][0-9]))$/i;

function getCurrentTime() {
    return moment().utcOffset(-240).format('YYYY-MM-DDTHH:mm:ss.SSSSSSSSSZ'); // RFC3339 UTC-4
}

function responseMessage(data, errCode, errMsg) {
    return {
        data: data,
        status: {
            code: errCode,
            message: errMsg,
            datetime: getCurrentTime()
        }
    };
}

// Parse cookie sessionId into the key in redis
function parseSessCookie(sessionId) {
    if (typeof sessionId !== 'string') return null; 

    // Signed cookie
    if (sessionId.substr(0, 2) === 's:') {
        return sessionId.slice(2, sessionId.lastIndexOf('.')) 
    }

    // Unsigned cookie
    return sessionId;
}

// Check wtoken in request header
let isAuthorizedHandler = async function(req, res, next) {
    const token = req.headers.wtoken;
    if (token !== process.env.API_TOKEN_CQ9) {
        req.logger.warn(`not authorized with token[${token}]`);
        return res.json(responseMessage(null, '1003', 'Wrong Wtoken'));
    }

    req.logger.verbose(`authorized with token[${token}]`);
    return next();
}

// Check mtcode in request body
let isValidMtcodeHandler = async function(req, res, next) {
    // Gather all required data
    const { mtcode } = req.body;
    // Check mtcode(record cannot be duplicated)
    try {
        const existMtcode = await req.redis.existsAsync(`${mtRedisPrefix}${mtcode}`);
        if (existMtcode === 1) {
            req.logger.verbose(`duplicate mtcode[${mtcode}]`);
            return res.json(responseMessage(null, '2009', 'Duplicated Mtcode'));
        }   
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json(responseMessage(null, '1100', 'Server Error'));
    }
    return next();
}

// Check session in request body
let isValidSessionHandler = async function(req, res, next) {
    // Gather all required data
    const { session } = req.body;

    // Parse cookie session id
    const sessionKey = parseSessCookie(session);
    
    // Check session(this user must login)
    try {
        const existSession = await req.redis.existsAsync(`sess:${sessionKey}`);
        if (existSession === 0) {
            req.logger.verbose(`invalid session[${sessionKey}]`);
            return res.json(responseMessage(null, '1003', 'Session Invalid'));
        }
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json(responseMessage(null, '1100', 'Server Error'));
    }
    return next();
}

// Invalid routes
let invalidRouteHandler = async function(req, res, next) {
    return res.json(responseMessage(null, '1002', 'Invalid Route'));
}

let checkPlayerHandler = async function(req, res, next) {
    const result = validationResult(req);

    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json(responseMessage(null, '1003', firstError));
    }

    // Gather all required data
    let { userGameWalletId } = req.params;

    // Prepare query
    let sqlString = `SELECT id FROM UserGameWallet WHERE id=?;`;
    let values = [userGameWalletId];
    sqlString = mysql.format(sqlString, values);

    // Get user 
    let results;
    try {
        results = await sqlAsync.query(req.db, sqlString);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json(responseMessage(null, '1100', 'Server Error'));
    }

    // Log
    req.logger.verbose(`user game wallet id[${userGameWalletId}] checked`);
    
    // User not found
    if(results.length <= 0) return res.json(responseMessage(false, '0', 'Success'));

    return res.json(responseMessage(true, '0', 'Success'));
};

let balanceHandler = async function(req, res, next) {
    const result = validationResult(req);

    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json(responseMessage(null, '1003', firstError));
    }

    // Gather all required data
    let { userGameWalletId } = req.params;

    // Prepare query
    let sqlString = `SELECT balance FROM UserGameWallet WHERE id=?;`;
    let values = [userGameWalletId];
    sqlString = mysql.format(sqlString, values);

    // Get balance 
    let results;
    try {
        results = await sqlAsync.query(req.db, sqlString);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json(responseMessage(null, '1100', 'Server Error'));
    }

    // User not found
    if(results.length <= 0) return res.json(responseMessage(null, '1006', 'User Not Found'));

    // Log
    req.logger.verbose(`user game wallet id[${userGameWalletId}] balance[${results[0].balance}]`);

    const resData = { balance: results[0].balance, currency: 'CNY' };
    return res.json(responseMessage(resData, '0', 'Success'));    
};

let recordHandler = async function(req, res, next) {
    const result = validationResult(req);

    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json(responseMessage(null, '1003', firstError));
    }
    
    // Gather all required data
    let { mtcode } = req.params;

    // Get mt record
    let mtRecordString;
    try {
        mtRecordString = await req.redis.getAsync(`${mtRedisPrefix}${mtcode}`);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json(responseMessage(null, '1100', 'Server Error'));
    }

    if (!mtRecordString) return res.json(responseMessage(null, '1014', 'Record Not Found'));
    
    const resData = JSON.parse(mtRecordString);
    return res.json(responseMessage(resData, '0', 'Success'));
};


// Bet
let takeAllHandler = async function(req, res, next) {
    const result = validationResult(req);

    // If the form data is invalid
    if (!result.isEmpty()) {
        // Invalid format eventTime needs special msg (but for empty eventTime use regular message)
        if (result.mapped().eventTime && req.body.eventTime) 
            return res.json(responseMessage(null, '1004', result.mapped().eventTime.msg));
        
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json(responseMessage(null, '1003', firstError));
    }

    // Gather all required data
    const {
        account,
        eventTime,
        gamehall,
        gamecode,
        roundid,
        mtcode,
        session,
    } = req.body;

    // Prepare query
    let sqlString = `   SELECT
                            uid, gameId, agentId, storeId, balance, frozenBalance
                        FROM UserGameWallet
                        WHERE id=?
                        FOR UPDATE;
                    `;
    let values = [account];
    sqlString = mysql.format(sqlString, values);
    
    // Execute transaction
	// Take all 
	try {
        // Get user game wallet info
        await sqlAsync.query(req.db, 'START TRANSACTION');
        let results = await sqlAsync.query(req.db, sqlString);
       
    
        // User not found
        if(results.length <= 0) {
            await sqlAsync.query(req.db, 'ROLLBACK');
            return res.json(responseMessage(null, '1006', 'User Not Found'));
        }
        const userGameWalletInfo = results[0];
    
        // Prepare mt record
        let mtRecord = {
            _id: mtcode,
            action: 'takeall',
            target: {
                account: account
            },
            status: {
                createtime: eventTime,
                endtime: getCurrentTime(),
                status: 'success',
                message: 'success'
            },
            before: userGameWalletInfo.balance,
            balance: 0,
            currency: 'CNY',
            event: [
                {
                    mtcode: mtcode,
                    amount: userGameWalletInfo.balance,
                    eventtime: eventTime
                }
            ]
        };
    
        // Not enough balance
        if (userGameWalletInfo.balance <= 0) {
            mtRecord.balance = userGameWalletInfo.balance;
            mtRecord.status.status = 'failed';
            mtRecord.status.message = 'Not Enough Balance';

            await req.redis.setAsync(`${mtRedisPrefix}${mtcode}`, JSON.stringify(mtRecord), 'EX', mtRedisExpireTime);
            await sqlAsync.query(req.db, 'ROLLBACK');
            req.logger.verbose(`user game wallet id[${account}] take all balance[${userGameWalletInfo.balance}] but not enough balance mtcode[${mtcode}]`);
            return res.json(responseMessage(null, '1005', 'Not Enough Balance'));
        }
    
        // Preapre query
        let sqlStringUpdate = ` UPDATE UserGameWallet 
                                SET 
                                    balance=balance-?,
                                    frozenBalance=frozenBalance+? 
                                WHERE id=?;`;
        values = [userGameWalletInfo.balance, userGameWalletInfo.balance, account];
        sqlStringUpdate = mysql.format(sqlStringUpdate, values);
    
        let sqlStringTrans = `  INSERT INTO GameTransaction (uid, transTypeCode, amount, relateUid, gameId, agentId, storeId)
                                VALUES (?, ?, ?, ?, ?, ?, ?);`;
        values = [userGameWalletInfo.uid, 1, userGameWalletInfo.balance * -1, userGameWalletInfo.uid, userGameWalletInfo.gameId, userGameWalletInfo.agentId, userGameWalletInfo.storeId];
        sqlStringTrans = mysql.format(sqlStringTrans, values);
		
        await sqlAsync.query(req.db, sqlStringUpdate + sqlStringTrans);
        await req.redis.setAsync(`${mtRedisPrefix}${mtcode}`, JSON.stringify(mtRecord), 'EX', mtRedisExpireTime);
        await sqlAsync.query(req.db, 'COMMIT');  // commit transaction only if all statement has executed without error

        // Log
        req.logger.verbose(`user game wallet id[${account}] take all balance[${userGameWalletInfo.balance}] mtcode[${mtcode}]`);

        const resData = { amount: userGameWalletInfo.balance, balance: 0, currency: 'CNY' };
        return res.json(responseMessage(resData, '0', 'Success'));    
	}
	catch (error) {
		await sqlAsync.query(req.db, 'ROLLBACK'); // rollback transaction if a statement produce error
		req.logger.error(`${error.message}`);
		return res.json(responseMessage(null, '1100', 'Server Error'));
	}
};

let betHandler = async function(req, res, next) {
    const result = validationResult(req);

    // If the form data is invalid
    if (!result.isEmpty()) {
        // Invalid format eventTime needs special msg (but for empty eventTime use regular message)
        if (result.mapped().eventTime && req.body.eventTime) 
            return res.json(responseMessage(null, '1004', result.mapped().eventTime.msg));

        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json(responseMessage(null, '1003', firstError));
    }

    // Gather all required data
    let {
        account,
        eventTime,
        gamehall,
        gamecode,
        roundid,
        amount,
        mtcode,
        session,
    } = req.body;

    // Covert data
    amount = Number(amount);

    // Prepare query
    let sqlString = `   SELECT
                            uid, gameId, agentId, storeId, balance, frozenBalance
                        FROM UserGameWallet
                        WHERE id=?
                        FOR UPDATE
                    ;`;
    let values = [account];
    sqlString = mysql.format(sqlString, values);
    
    // Execute transaction
	// Bet
	try {
        // Get user game wallet info
        await sqlAsync.query(req.db, 'START TRANSACTION');
        let results = await sqlAsync.query(req.db, sqlString);

        // User not found
        if(results.length <= 0) {
            await sqlAsync.query(req.db, 'ROLLBACK');
            return res.json(responseMessage(null, '1006', 'User Not Found'));
        }
    
        // Caculate
        const userGameWalletInfo = results[0];
        const postBalance = userGameWalletInfo.balance - amount;
    
        // Prepare mt record
        let mtRecord = {
            _id: mtcode,
            action: 'bet',
            target: {
                account: account
            },
            status: {
                createtime: eventTime,
                endtime: getCurrentTime(),
                status: 'success',
                message: 'success'
            },
            before: userGameWalletInfo.balance,
            balance: postBalance,
            currency: 'CNY',
            event: [
                {
                    mtcode: mtcode,
                    amount: amount,
                    eventtime: eventTime
                }
            ]
        };
    
        // Not enough balance
        if (postBalance < 0 || userGameWalletInfo.balance <= 0) {
            mtRecord.balance = userGameWalletInfo.balance;
            mtRecord.status.status = 'failed';
            mtRecord.status.message = 'Not Enough Balance';
            
            await req.redis.setAsync(`${mtRedisPrefix}${mtcode}`, JSON.stringify(mtRecord), 'EX', mtRedisExpireTime);
            await sqlAsync.query(req.db, 'ROLLBACK');
            req.logger.verbose(`user game wallet id[${account}] balance[${userGameWalletInfo.balance}] bet[${amount}] but not enough balance mtcode[${mtcode}]`);
            return res.json(responseMessage(null, '1005', 'Not Enough Balance'));
        }
    
        // Preapre query
        let sqlStringUpdate = ` UPDATE UserGameWallet 
                                SET 
                                    balance=balance-?,
                                    frozenBalance=frozenBalance+? 
                                WHERE id=?;`;
        values = [amount, amount, account];
        sqlStringUpdate = mysql.format(sqlStringUpdate, values);
    
        let sqlStringTrans = `  INSERT INTO GameTransaction (uid, transTypeCode, amount, relateUid, gameId, agentId, storeId)
                                VALUES (?, ?, ?, ?, ?, ?, ?);`;
        values = [userGameWalletInfo.uid, 1, amount * -1, userGameWalletInfo.uid, userGameWalletInfo.gameId, userGameWalletInfo.agentId, userGameWalletInfo.storeId];
        sqlStringTrans = mysql.format(sqlStringTrans, values);
		
        await sqlAsync.query(req.db, sqlStringUpdate + sqlStringTrans);
        await req.redis.setAsync(`${mtRedisPrefix}${mtcode}`, JSON.stringify(mtRecord), 'EX', mtRedisExpireTime);
        await sqlAsync.query(req.db, 'COMMIT');  // commit transaction only if all statement has executed without error

        // Log
        req.logger.verbose(`user game wallet id[${account}] balance[${userGameWalletInfo.balance}] bet[${amount}] mtcode[${mtcode}]`);

        const resData = { balance: postBalance, currency: 'CNY' };
        return res.json(responseMessage(resData, '0', 'Success'));    
	}
	catch (error) {
		await sqlAsync.query(req.db, 'ROLLBACK'); // rollback transaction if a statement produce error
		req.logger.error(`${error.message}`);
		return res.json(responseMessage(null, '1100', 'Server Error'));
	}
};

let rollOutHandler = async function(req, res, next) {
    const result = validationResult(req);

    // If the form data is invalid
    if (!result.isEmpty()) {
        // Invalid format eventTime needs special msg (but for empty eventTime use regular message)
        if (result.mapped().eventTime && req.body.eventTime) 
            return res.json(responseMessage(null, '1004', result.mapped().eventTime.msg));

        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json(responseMessage(null, '1003', firstError));
    }

    // Gather all required data
    let {
        account,
        eventTime,
        gamehall,
        gamecode,
        roundid,
        amount,
        mtcode,
        session,
    } = req.body;

    // Covert data
    amount = Number(amount);

    // Prepare query
    let sqlString = `   SELECT
                            uid, gameId, agentId, storeId, balance, frozenBalance
                        FROM UserGameWallet
                        WHERE id=?
                        FOR UPDATE
                    ;`;
    let values = [account];
    sqlString = mysql.format(sqlString, values);
    
    // Execute transaction
	// Take all 
	try {
        // Get user game wallet info
        await sqlAsync.query(req.db, 'START TRANSACTION');
        let results = await sqlAsync.query(req.db, sqlString);
    
        // User not found
        if(results.length <= 0) {
            await sqlAsync.query(req.db, 'ROLLBACK');
            return res.json(responseMessage(null, '1006', 'User Not Found'));
        }
    
        // Caculate
        const userGameWalletInfo = results[0];
        const postBalance = userGameWalletInfo.balance - amount;
    
        // Prepare mt record
        let mtRecord = {
            _id: mtcode,
            action: 'rollout',
            target: {
                account: account
            },
            status: {
                createtime: eventTime,
                endtime: getCurrentTime(),
                status: 'success',
                message: 'success'
            },
            before: userGameWalletInfo.balance,
            balance: postBalance,
            currency: 'CNY',
            event: [
                {
                    mtcode: mtcode,
                    amount: amount,
                    eventtime: eventTime
                }
            ]
        };
    
        // Not enough balance
        if (postBalance < 0 || userGameWalletInfo.balance <= 0) {
            mtRecord.balance = userGameWalletInfo.balance;
            mtRecord.status.status = 'failed';
            mtRecord.status.message = 'Not Enough Balance';

            await req.redis.setAsync(`${mtRedisPrefix}${mtcode}`, JSON.stringify(mtRecord), 'EX', mtRedisExpireTime);
            await sqlAsync.query(req.db, 'ROLLBACK');
            req.logger.verbose(`user game wallet id[${account}] balance[${userGameWalletInfo.balance}] rollout[${amount}] but not enough balance mtcode[${mtcode}]`);
            return res.json(responseMessage(null, '1005', 'Not Enough Balance'));
        }
    
        // Preapre query
        let sqlStringUpdate = ` UPDATE UserGameWallet 
                                SET 
                                    balance=balance-?,
                                    frozenBalance=frozenBalance+? 
                                WHERE id=?;`;
        values = [amount, amount, account];
        sqlStringUpdate = mysql.format(sqlStringUpdate, values);
    
        let sqlStringTrans = `  INSERT INTO GameTransaction (uid, transTypeCode, amount, relateUid, gameId, agentId, storeId)
                                VALUES (?, ?, ?, ?, ?, ?, ?);`;
        values = [userGameWalletInfo.uid, 1, amount * -1, userGameWalletInfo.uid, userGameWalletInfo.gameId, userGameWalletInfo.agentId, userGameWalletInfo.storeId];
        sqlStringTrans = mysql.format(sqlStringTrans, values);
		
        await sqlAsync.query(req.db, sqlStringUpdate + sqlStringTrans);
        await req.redis.setAsync(`${mtRedisPrefix}${mtcode}`, JSON.stringify(mtRecord), 'EX', mtRedisExpireTime);
        await sqlAsync.query(req.db, 'COMMIT');  // commit transaction only if all statement has executed without error

        // Log
        req.logger.verbose(`user game wallet id[${account}] balance[${userGameWalletInfo.balance}] rollout[${amount}] mtcode[${mtcode}]`);

        const resData = { balance: postBalance, currency: 'CNY' };
        return res.json(responseMessage(resData, '0', 'Success'));   
	}
	catch (error) {
		await sqlAsync.query(req.db, 'ROLLBACK'); // rollback transaction if a statement produce error
		req.logger.error(`${error.message}`);
		return res.json(responseMessage(null, '1100', 'Server Error'));
	}
};


// Resolve
let rollInHandler = async function(req, res, next) {
    const result = validationResult(req);
    console.log(req.body);
    // If the form data is invalid
    if (!result.isEmpty()) {
        // Invalid format eventTime needs special msg (but for empty eventTime use regular message)
        if (result.mapped().eventTime && req.body.eventTime) 
            return res.json(responseMessage(null, '1004', result.mapped().eventTime.msg));
        if (result.mapped().createTime && req.body.createTime) 
            return res.json(responseMessage(null, '1004', result.mapped().createTime.msg));
        
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json(responseMessage(null, '1003', firstError));
    }

    // Gather all required data
    let {
        account,
        eventTime,
        gamehall,
        gamecode,
        roundid,
        bet,
        win,
        amount,
        mtcode,
        createTime,
        winpc,
        rake,
        gametype,
    } = req.body;

    // Covert data
    bet = Number(bet);
    win = Number(win);
    amount = Number(amount);
    winpc = Number(winpc);
    rake = Number(rake);

    // Prepare query
    let sqlString = `   SELECT 
                            uid, gameId, agentId, storeId, balance, frozenBalance
                        FROM UserGameWallet
                        WHERE id=?;`;
    let values = [account];
    sqlString = mysql.format(sqlString, values);

    // Get user game wallet info
    let results;
    try {
        results = await sqlAsync.query(req.db, sqlString);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json(responseMessage(null, '1100', 'Server Error'));
    }

    // User not found
    if(results.length <= 0) return res.json(responseMessage(null, '1006', 'User Not Found'));

    // Caculate profit
    const userGameWalletInfo = results[0];
    const postBalance = userGameWalletInfo.balance + amount;
    let profit;
    if (gametype === 'table') {
        profit = rake - winpc;
    } else { // 'arcade', 'fish', 'slot'
        profit = userGameWalletInfo.frozenBalance - amount;
    }

    console.log({amount, profit, postBalance});
     

    // Prepare mt reocrd
    let mtRecord = {
        _id: mtcode,
        action: 'rollin',
        target: {
            account: account
        },
        status: {
            createtime: eventTime,
            endtime: getCurrentTime(),
            status: 'success',
            message: 'success'
        },
        before: userGameWalletInfo.balance,
        balance: postBalance,
        currency: 'CNY',
        event: [
            {
                mtcode: mtcode,
                amount: amount,
                eventtime: eventTime
            }
        ]
    };

    // Prepare query, roll in money to user and agent
    let sqlStringUpdate1 = `    UPDATE UserGameWallet 
                                SET 
                                    balance=balance+?,
                                    frozenBalance=frozenBalance-? 
                                WHERE id=?;`;
    values = [amount, userGameWalletInfo.frozenBalance, account];
    sqlStringUpdate1 = mysql.format(sqlStringUpdate1, values);

    let sqlStringUpdate2 = `    UPDATE AgentInfo
                                SET 
                                    gameProfit=gameProfit+?
                                WHERE id=?;`;
    values = [profit, userGameWalletInfo.agentId];
    sqlStringUpdate2 = mysql.format(sqlStringUpdate2, values);

    let sqlStringTrans1 = ` INSERT INTO GameTransaction
                            (uid, transTypeCode, amount, relateUid, gameId, agentId, storeId)
                            VALUES (?, ?, ?, ?, ?, ?, ?);`;
    values = [userGameWalletInfo.uid, 2, amount, userGameWalletInfo.uid, userGameWalletInfo.gameId, userGameWalletInfo.agentId, userGameWalletInfo.storeId];
    sqlStringTrans1 = mysql.format(sqlStringTrans1, values);

    let sqlStringTrans2 = ` INSERT INTO GameTransaction
                            (uid, transTypeCode, amount, relateUid, gameId, agentId, storeId)
                            VALUES ((SELECT uid FROM AgentInfo WHERE id=?), ?, ?, ?, ?, ?, ?);`;
    values = [userGameWalletInfo.agentId, 2, profit, userGameWalletInfo.uid, userGameWalletInfo.gameId, userGameWalletInfo.agentId, userGameWalletInfo.storeId];
    sqlStringTrans2 = mysql.format(sqlStringTrans2, values);

    // Execute transaction
	// Roll in 
	try {
		await sqlAsync.query(req.db, 'START TRANSACTION');
        await sqlAsync.query(req.db, sqlStringUpdate1 + sqlStringUpdate2 + sqlStringTrans1 + sqlStringTrans2);
        await req.redis.setAsync(`${mtRedisPrefix}${mtcode}`, JSON.stringify(mtRecord), 'EX', mtRedisExpireTime);
	}
	catch (error) {
		await sqlAsync.query(req.db, 'ROLLBACK'); // rollback transaction if a statement produce error
		req.logger.error(`${error.message}`);
		return res.json(responseMessage(null, '1100', 'Server Error'));
	}
	await sqlAsync.query(req.db, 'COMMIT');  // commit transaction only if all statement has executed without error

    // Log
    req.logger.verbose(`user game wallet id[${account}] roll in amount[${amount}] profit[${profit}] mtcode[${mtcode}]`);

    const resData = { balance: postBalance, currency: 'CNY' };
    return res.json(responseMessage(resData, '0', 'Success'));  
};

let endRoundHandler = async function(req, res, next) {
    const result = validationResult(req);
    console.log(req.body);
    // If the form data is invalid
    if (!result.isEmpty()) {
        // Invalid eventTime needs special msg
        if (result.mapped().data && result.mapped().data.msg === 'EventTime Invalid') 
            return res.json(responseMessage(null, '1004', result.mapped().data.msg));
        if (result.mapped().createTime && req.body.createTime) 
            return res.json(responseMessage(null, '1004', result.mapped().createTime.msg));
        
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json(responseMessage(null, '1003', firstError));
    }

    // Gather all required data
    let {
        account,
        gamehall,
        gamecode,
        roundid,
        data,
        createTime,
    } = req.body;

    // Covert data
    data = JSON.parse(data);
    const amount = data.reduce( (sum, curData) => (sum + Number(curData.amount)), 0 );
    const mtcodes = data.map(curData => curData.mtcode);

    console.log({amount});

    // Special case: mt code number > 1, just check the first one
    // Becauz if first exist, other must exist 
    // Check mtcode(record cannot be duplicated)
    try {
        const existMtcode = await req.redis.existsAsync(`${mtRedisPrefix}${mtcodes[0]}`);
        if (existMtcode === 1) {
            req.logger.verbose(`duplicate mtcode[${mtcodes[0]}]`);
            return res.json(responseMessage(null, '2009', 'Duplicated Mtcode'));
        }
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json(responseMessage(null, '1100', 'Server Error'));
    }
    
    
    // Prepare query
    let sqlString = `   SELECT 
                            uid, gameId, agentId, storeId, balance, frozenBalance
                        FROM UserGameWallet
                        WHERE id=?;`;
    let values = [account];
    sqlString = mysql.format(sqlString, values);

    // Get user game wallet info
    let results;
    try {
        results = await sqlAsync.query(req.db, sqlString);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json(responseMessage(null, '1100', 'Server Error'));
    }

    // User not found
    if(results.length <= 0) return res.json(responseMessage(null, '1006', 'User Not Found'));

    // Caculate profit
    const userGameWalletInfo = results[0];
    const postBalance = userGameWalletInfo.balance + amount;
    const profit = userGameWalletInfo.frozenBalance - amount;
    
    // Prepare mt reocrd
    // Special case: mtRecord number > 1
    // For each mtcode, create a mtRecord (for search)
    let mtRecords = mtcodes.map( curMtcode => ({
        mtcode: curMtcode,
        mtRecord: {
            _id: curMtcode,
            action: 'endround',
            target: {
                account: account
            },
            status: {
                createtime: getCurrentTime(),
                endtime: getCurrentTime(),
                status: 'success',
                message: 'success'
            },
            before: userGameWalletInfo.balance,
            balance: postBalance,
            currency: 'CNY',
            event: [ ...data ]
        }
    }));
    
    // Prepare query, roll in money to user and agent
    let sqlStringUpdate1 = `    UPDATE UserGameWallet 
                                SET 
                                    balance=balance+?,
                                    frozenBalance=frozenBalance-? 
                                WHERE id=?;`;
    values = [amount, userGameWalletInfo.frozenBalance, account];
    sqlStringUpdate1 = mysql.format(sqlStringUpdate1, values);

    let sqlStringUpdate2 = `    UPDATE AgentInfo
                                SET 
                                    gameProfit=gameProfit+?
                                WHERE id=?;`;
    values = [profit, userGameWalletInfo.agentId];
    sqlStringUpdate2 = mysql.format(sqlStringUpdate2, values);

    let sqlStringTrans1 = ` INSERT INTO GameTransaction
                            (uid, transTypeCode, amount, relateUid, gameId, agentId, storeId)
                            VALUES (?, ?, ?, ?, ?, ?, ?);`;
    values = [userGameWalletInfo.uid, 2, amount, userGameWalletInfo.uid, userGameWalletInfo.gameId, userGameWalletInfo.agentId, userGameWalletInfo.storeId];
    sqlStringTrans1 = mysql.format(sqlStringTrans1, values);

    let sqlStringTrans2 = ` INSERT INTO GameTransaction
                            (uid, transTypeCode, amount, relateUid, gameId, agentId, storeId)
                            VALUES ((SELECT uid FROM AgentInfo WHERE id=?), ?, ?, ?, ?, ?, ?);`;
    values = [userGameWalletInfo.agentId, 2, profit, userGameWalletInfo.uid, userGameWalletInfo.gameId, userGameWalletInfo.agentId, userGameWalletInfo.storeId];
    sqlStringTrans2 = mysql.format(sqlStringTrans2, values);

    // Execute transaction
	// Endround
	try {
		await sqlAsync.query(req.db, 'START TRANSACTION');
        await sqlAsync.query(req.db, sqlStringUpdate1 + sqlStringUpdate2 + sqlStringTrans1 + sqlStringTrans2);

        // Special case: mtRecord number > 1
        // For each mtcode, create a mtRecord (for search)
        let redisTasks = [];
        mtRecords.forEach(curRecord => {
            redisTasks.push(req.redis.setAsync(`${mtRedisPrefix}${curRecord.mtcode}`, JSON.stringify(curRecord.mtRecord), 'EX', mtRedisExpireTime));
        });
        await Promise.all(redisTasks);
	}
	catch (error) {
		await sqlAsync.query(req.db, 'ROLLBACK'); // rollback transaction if a statement produce error
		req.logger.error(`${error.message}`);
		return res.json(responseMessage(null, '1100', 'Server Error'));
	}
	await sqlAsync.query(req.db, 'COMMIT');  // commit transaction only if all statement has executed without error

    // Log
    req.logger.verbose(`user game wallet id[${account}] endround amount[${amount}] profit[${profit}] mtcode[${mtcodes[0]}]`);

    const resData = { balance: postBalance, currency: 'CNY' };
    return res.json(responseMessage(resData, '0', 'Success'));  
};


let refundHandler = async function(req, res, next) {
    const result = validationResult(req);

    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json(responseMessage(null, '1003', firstError));
    }

    // Gather all required data
    let { mtcode } = req.body;

    // Get mt record
    let mtRecord;
    try {
        mtRecord = await req.redis.getAsync(`${mtRedisPrefix}${mtcode}`);
        mtRecord = JSON.parse(mtRecord);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json(responseMessage(null, '1100', 'Server Error'));
    }

    // Mt record not found
    if (!mtRecord) return res.json(responseMessage(null, '1014', 'Record Not Found'));

    // Already refund
    if (mtRecord.status.status === 'refund') return res.json(responseMessage(null, '1015', 'Bet Action Has Already Refund'));

    // Wrong action
    if (mtRecord.action !== 'bet') return res.json(responseMessage(null, '1015', 'Not Refunding Bet Action'));

    // Bet failed
    if (mtRecord.status.status === 'failed') return res.json(responseMessage(null, '1015', 'Cannot Refund Failed Bet Action'));
    
    // Refund data
    const account = mtRecord.target.account;
    const amount = mtRecord.before - mtRecord.balance;
    
    // Prepare query
    let sqlString = `SELECT uid, gameId, agentId, storeId, balance, frozenBalance FROM UserGameWallet WHERE id=?;`;
    let values = [account];
    sqlString = mysql.format(sqlString, values);

    // Get user game wallet info
    let results;
    try {
        results = await sqlAsync.query(req.db, sqlString);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json(responseMessage(null, '1100', 'Server Error'));
    }

    // User not found
    if(results.length <= 0) return res.json(responseMessage(null, '1006', 'User Not Found'));

    // Caculate
    const userGameWalletInfo = results[0];
    const postBalance = userGameWalletInfo.balance + amount;
    const postFrozenBalance = userGameWalletInfo.frozenBalance - amount;

    // Prepare mt record
    mtRecord.status.status = 'refund';
    mtRecord.before = userGameWalletInfo.balance;
    mtRecord.balance = postBalance;

    // Preapre query
    let sqlStringUpdate = ` UPDATE UserGameWallet 
                            SET 
                                balance=balance+?,
                                frozenBalance=frozenBalance-? 
                            WHERE id=?;`;
    values = [amount, amount, account];
    sqlStringUpdate = mysql.format(sqlStringUpdate, values);

    let sqlStringTrans = `  INSERT INTO GameTransaction (uid, transTypeCode, amount, relateUid, gameId, agentId, storeId)
                            VALUES (?, ?, ?, ?, ?, ?, ?);`;
    values = [userGameWalletInfo.uid, 3, amount, userGameWalletInfo.uid, userGameWalletInfo.gameId, userGameWalletInfo.agentId, userGameWalletInfo.storeId];
    sqlStringTrans = mysql.format(sqlStringTrans, values);

  // Execute transaction
	// Refund
	try {
		await sqlAsync.query(req.db, 'START TRANSACTION');
        await sqlAsync.query(req.db, sqlStringUpdate + sqlStringTrans);
        await req.redis.setAsync(`${mtRedisPrefix}${mtcode}`, JSON.stringify(mtRecord), 'EX', mtRedisExpireTime);
	}
	catch (error) {
		await sqlAsync.query(req.db, 'ROLLBACK'); // rollback transaction if a statement produce error
		req.logger.error(`${error.message}`);
		return res.json(responseMessage(null, '1100', 'Server Error'));
	}
	await sqlAsync.query(req.db, 'COMMIT');  // commit transaction only if all statement has executed without error

    // Log
    req.logger.verbose(`user game wallet id[${account}] balance[${userGameWalletInfo.balance}] refund amount[${amount}] mtcode[${mtcode}]`);

    const resData = { balance: postBalance, currency: 'CNY' };
    return res.json(responseMessage(resData, '0', 'Success'));   
};


// Do nothing
// We handle ourselves
let debitHandler = async function(req, res, next) {
    const result = validationResult(req);

    // If the form data is invalid
    if (!result.isEmpty()) {
        // Invalid format eventTime needs special msg (but for empty eventTime use regular message)
        if (result.mapped().eventTime && req.body.eventTime) 
            return res.json(responseMessage(null, '1004', result.mapped().eventTime.msg));
        
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json(responseMessage(null, '1003', firstError));
    }

    // Gather all required data
    let {
        account,
        eventTime,
        gamehall,
        gamecode,
        roundid,
        amount,
        mtcode,
    } = req.body;

    // Covert data
    amount = Number(amount);
    
    // Prepare query
    let sqlString = `   SELECT 
                            uid, gameId, agentId, storeId, balance, frozenBalance
                        FROM UserGameWallet
                        WHERE id=?;`;
    let values = [account];
    sqlString = mysql.format(sqlString, values);

    // Get user game wallet info
    let results;
    try {
        results = await sqlAsync.query(req.db, sqlString);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json(responseMessage(null, '1100', 'Server Error'));
    }

    // User not found
    if(results.length <= 0) return res.json(responseMessage(null, '1006', 'User Not Found'));

    // Caculate profit
    const userGameWalletInfo = results[0];
    const postBalance = userGameWalletInfo.balance - amount;

    // Prepare mt reocrd
    let mtRecord = {
        _id: mtcode,
        action: 'debit',
        target: {
            account: account
        },
        status: {
            createtime: eventTime,
            endtime: getCurrentTime(),
            status: 'success',
            message: 'success'
        },
        before: userGameWalletInfo.balance,
        balance: postBalance,
        currency: 'CNY',
        event: [
            {
                mtcode: mtcode,
                amount: amount,
                eventtime: eventTime
            }
        ]
    };

    // Not enough balance
    if (postBalance < 0) {
        mtRecord.balance = userGameWalletInfo.balance;
        mtRecord.status.status = 'failed';
        mtRecord.status.message = 'Not Enough Balance';
        
        await req.redis.setAsync(`${mtRedisPrefix}${mtcode}`, JSON.stringify(mtRecord), 'EX', mtRedisExpireTime);
        req.logger.verbose(`user game wallet id[${account}] balance[${userGameWalletInfo.balance}] debit[${amount}] but not enough balance mtcode[${mtcode}]`);
        return res.json(responseMessage(null, '1005', 'Not Enough Balance'));
    }

    // Prepare query
    let sqlStringUpdate1 = `    UPDATE UserGameWallet 
                                SET 
                                    balance=balance-?
                                WHERE id=?;`;
    values = [amount, account];
    sqlStringUpdate1 = mysql.format(sqlStringUpdate1, values);

    let sqlStringTrans1 = ` INSERT INTO GameTransaction
                            (uid, transTypeCode, amount, relateUid, gameId, agentId, storeId)
                            VALUES (?, ?, ?, ?, ?, ?, ?);`;
    values = [userGameWalletInfo.uid, 7, amount * -1, userGameWalletInfo.uid, userGameWalletInfo.gameId, userGameWalletInfo.agentId, userGameWalletInfo.storeId];
    sqlStringTrans1 = mysql.format(sqlStringTrans1, values);

    // Execute transaction
	// Debit
	try {
		await sqlAsync.query(req.db, 'START TRANSACTION');
        await sqlAsync.query(req.db, sqlStringUpdate1 + sqlStringTrans1);
        await req.redis.setAsync(`${mtRedisPrefix}${mtcode}`, JSON.stringify(mtRecord), 'EX', mtRedisExpireTime);
	}
	catch (error) {
		await sqlAsync.query(req.db, 'ROLLBACK'); // rollback transaction if a statement produce error
		req.logger.error(`${error.message}`);
		return res.json(responseMessage(null, '1100', 'Server Error'));
	}
	await sqlAsync.query(req.db, 'COMMIT');  // commit transaction only if all statement has executed without error

    // Log
    req.logger.verbose(`user game wallet id[${account}] debit amount[${amount}]  mtcode[${mtcode}]`);

    const resData = { balance: postBalance, currency: 'CNY' };
    return res.json(responseMessage(resData, '0', 'Success'));  
};

// Do nothing
// We handle ourselves
let creditHandler = async function(req, res, next) {
    const result = validationResult(req);

    // If the form data is invalid
    if (!result.isEmpty()) {
        // Invalid format eventTime needs special msg (but for empty eventTime use regular message)
        if (result.mapped().eventTime && req.body.eventTime) 
            return res.json(responseMessage(null, '1004', result.mapped().eventTime.msg));
        
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json(responseMessage(null, '1003', firstError));
    }

    // Gather all required data
    let {
        account,
        eventTime,
        gamehall,
        gamecode,
        roundid,
        amount,
        mtcode,
    } = req.body;

    // Covert data
    amount = Number(amount);

   
    // Prepare query
    let sqlString = `   SELECT 
                            uid, gameId, agentId, storeId, balance, frozenBalance
                        FROM UserGameWallet
                        WHERE id=?;`;
    let values = [account];
    sqlString = mysql.format(sqlString, values);

    // Get user game wallet info
    let results;
    try {
        results = await sqlAsync.query(req.db, sqlString);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json(responseMessage(null, '1100', 'Server Error'));
    }

    // User not found
    if(results.length <= 0) return res.json(responseMessage(null, '1006', 'User Not Found'));

    // Caculate profit
    const userGameWalletInfo = results[0];
    const postBalance = userGameWalletInfo.balance + amount;

    // Prepare mt reocrd
    let mtRecord = {
        _id: mtcode,
        action: 'credit',
        target: {
            account: account
        },
        status: {
            createtime: eventTime,
            endtime: getCurrentTime(),
            status: 'success',
            message: 'success'
        },
        before: userGameWalletInfo.balance,
        balance: postBalance,
        currency: 'CNY',
        event: [
            {
                mtcode: mtcode,
                amount: amount,
                eventtime: eventTime
            }
        ]
    };

    // Prepare query
    let sqlStringUpdate1 = `    UPDATE UserGameWallet 
                                SET 
                                    balance=balance+?
                                WHERE id=?;`;
    values = [amount, account];
    sqlStringUpdate1 = mysql.format(sqlStringUpdate1, values);

    let sqlStringTrans1 = ` INSERT INTO GameTransaction
                            (uid, transTypeCode, amount, relateUid, gameId, agentId, storeId)
                            VALUES (?, ?, ?, ?, ?, ?, ?);`;
    values = [userGameWalletInfo.uid, 7, amount, userGameWalletInfo.uid, userGameWalletInfo.gameId, userGameWalletInfo.agentId, userGameWalletInfo.storeId];
    sqlStringTrans1 = mysql.format(sqlStringTrans1, values);

    // Execute transaction
	// Credit
	try {
		await sqlAsync.query(req.db, 'START TRANSACTION');
        await sqlAsync.query(req.db, sqlStringUpdate1 + sqlStringTrans1);
        await req.redis.setAsync(`${mtRedisPrefix}${mtcode}`, JSON.stringify(mtRecord), 'EX', mtRedisExpireTime);
	}
	catch (error) {
		await sqlAsync.query(req.db, 'ROLLBACK'); // rollback transaction if a statement produce error
		req.logger.error(`${error.message}`);
		return res.json(responseMessage(null, '1100', 'Server Error'));
	}
	await sqlAsync.query(req.db, 'COMMIT');  // commit transaction only if all statement has executed without error

    // Log
    req.logger.verbose(`user game wallet id[${account}] credit amount[${amount}]  mtcode[${mtcode}]`);

    const resData = { balance: postBalance, currency: 'CNY' };
    return res.json(responseMessage(resData, '0', 'Success'));  
};

let payOffHandler = async function(req, res, next) {
    const result = validationResult(req);

    // If the form data is invalid
    if (!result.isEmpty()) {
        // Invalid format eventTime needs special msg (but for empty eventTime use regular message)
        if (result.mapped().eventTime && req.body.eventTime) 
            return res.json(responseMessage(null, '1004', result.mapped().eventTime.msg));
        
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json(responseMessage(null, '1003', firstError));
    }

    // Gather all required data
    let {
        account,
        eventTime,
        amount,
        mtcode,
    } = req.body;

    // Covert data
    amount = Number(amount);

    // Prepare query
    let sqlString = `   SELECT 
                            uid, gameId, agentId, storeId, balance, frozenBalance
                        FROM UserGameWallet
                        WHERE id=?;`;
    let values = [account];
    sqlString = mysql.format(sqlString, values);

    // Get user game wallet info
    let results;
    try {
        results = await sqlAsync.query(req.db, sqlString);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json(responseMessage(null, '1100', 'Server Error'));
    }

    // User not found
    if(results.length <= 0) return res.json(responseMessage(null, '1006', 'User Not Found'));

    // Caculate
    const userGameWalletInfo = results[0];
    const postBalance = userGameWalletInfo.balance + amount;

    // Prepare mt reocrd
    let mtRecord = {
        _id: mtcode,
        action: 'payoff',
        target: {
            account: account
        },
        status: {
            createtime: eventTime,
            endtime: getCurrentTime(),
            status: 'success',
            message: 'success'
        },
        before: userGameWalletInfo.balance,
        balance: postBalance,
        currency: 'CNY',
        event: [
            {
                mtcode: mtcode,
                amount: amount,
                eventtime: eventTime
            }
        ]
    };

    // Prepare query, roll in money to user
    let sqlStringUpdate1 = `    UPDATE UserGameWallet 
                                SET balance=balance+?
                                WHERE id=?;`;
    values = [amount, account];
    sqlStringUpdate1 = mysql.format(sqlStringUpdate1, values);

    let sqlStringTrans1 = ` INSERT INTO GameTransaction
                            (uid, transTypeCode, amount, relateUid, gameId, agentId, storeId)
                            VALUES (?, ?, ?, ?, ?, ?, ?);`;
    values = [userGameWalletInfo.uid, 6, amount, userGameWalletInfo.uid, userGameWalletInfo.gameId, userGameWalletInfo.agentId, userGameWalletInfo.storeId];
    sqlStringTrans1 = mysql.format(sqlStringTrans1, values);

    // Execute transaction
	// Payoff
	try {
		await sqlAsync.query(req.db, 'START TRANSACTION');
        await sqlAsync.query(req.db, sqlStringUpdate1 + sqlStringTrans1);
        await req.redis.setAsync(`${mtRedisPrefix}${mtcode}`, JSON.stringify(mtRecord), 'EX', mtRedisExpireTime);
	}
	catch (error) {
		await sqlAsync.query(req.db, 'ROLLBACK'); // rollback transaction if a statement produce error
		req.logger.error(`${error.message}`);
		return res.json(responseMessage(null, '1100', 'Server Error'));
	}
	await sqlAsync.query(req.db, 'COMMIT');  // commit transaction only if all statement has executed without error

    // Log
    req.logger.verbose(`user game wallet id[${account}] payoff amount[${amount}] mtcode[${mtcode}]`);

    const resData = { balance: postBalance, currency: 'CNY' };
    return res.json(responseMessage(resData, '0', 'Success'));  
};


// Form data validate generators
// Invoke it to produce a middleware for validating
function checkPlayerValidator(){
    return [
        param('userGameWalletId')
            .isLength({ min:1 }).withMessage('Account Is Required')
            .isLength({ max:36 }).withMessage('Account Exceed Max Len 36'),
    ];
}

function balanceValidator(){
    return [
        param('userGameWalletId')
            .isLength({ min:1 }).withMessage('Account Is Required')
            .isLength({ max:36 }).withMessage('Account Exceed Max Len 36'),
    ];
}

function recordValidator(){
    return [
        param('mtcode')
            .isLength({ min:1 }).withMessage('MtCode Is Required')
            .isLength({ max:70 }).withMessage('MtCode Exceed Max Len 70'),
    ];
}

function takeAllValidator(){
    return [
        // Check format
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('account')
            .isLength({ min:1 }).withMessage('Account Is Required')
            .isLength({ max:36 }).withMessage('Account Exceed Max Len 36'),
        body('eventTime')
            .custom(async function(data, {req}){
                // RFC3339
                if (!regexRFC3339.test(data)) throw Error('EventTime Invalid');
                return true;
            }),
        body('gamehall')
            .isLength({ min:1 }).withMessage('GameHall Is Required')
            .isLength({ max:36 }).withMessage('GameHall Exceed Max Len 36'),
        body('gamecode')
            .isLength({ min:1 }).withMessage('GameCode Is Required')
            .isLength({ max:36 }).withMessage('GameCode Exceed Max Len 36'),
        body('roundid')
            .isLength({ min:1 }).withMessage('RoundId Is Required')
            .isLength({ max:50 }).withMessage('RoundId Exceed Max Len 50'),
        body('mtcode')
            .isLength({ min:1 }).withMessage('MtCode Is Required')
            .isLength({ max:70 }).withMessage('MtCode Exceed Max Len 70'),

        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 
    ];
}

function rollInValidator(){
    return [
        // Check format
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('account')
            .isLength({ min:1 }).withMessage('Account Is Required')
            .isLength({ max:36 }).withMessage('Account Exceed Max Len 36'),
        body('eventTime')
            .custom(async function(data, {req}){
                // RFC3339
                if (!regexRFC3339.test(data)) throw Error('EventTime Invalid');
                return true;
            }),
        body('gamehall')
            .isLength({ min:1 }).withMessage('GameHall Is Required')
            .isLength({ max:36 }).withMessage('GameHall Exceed Max Len 36'),
        body('gamecode')
            .isLength({ min:1 }).withMessage('GameCode Is Required')
            .isLength({ max:36 }).withMessage('GameCode Exceed Max Len 36'),
        body('roundid')
            .isLength({ min:1 }).withMessage('RoundId Is Required')
            .isLength({ max:50 }).withMessage('RoundId Exceed Max Len 50'),
        body('bet')
            .isFloat({ min: 0 }).withMessage('Bet Invalid'),
        body('win')
            .isFloat().withMessage('Win Invalid'),
        body('amount')
            .isFloat({ min: 0 }).withMessage('Amount Invalid'),
        body('mtcode')
            .isLength({ min:1 }).withMessage('MtCode Is Required')
            .isLength({ max:70 }).withMessage('MtCode Exceed Max Len 70'),
        body('createTime')
            .custom(async function(data, {req}){
                // RFC3339
                if (!regexRFC3339.test(data)) throw Error('CreateTime Invalid');
                return true;
            }),
        body('winpc')
            .isFloat().withMessage('Winpc Invalid'),
        body('rake')
            .isFloat().withMessage('Rake Invalid'),
        body('gametype')
            .isLength({ min:1 }).withMessage('GameType Is Required')
            .isLength({ max:36 }).withMessage('GameType Exceed Max Len 36'),

        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 
    ];
}

function betValidator(){
    return [
        // Check format
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('account')
            .isLength({ min:1 }).withMessage('Account Is Required')
            .isLength({ max:36 }).withMessage('Account Exceed Max Len 36'),
        body('eventTime')
            .custom(async function(data, {req}){
                // RFC3339
                if (!regexRFC3339.test(data)) throw Error('EventTime Invalid');
                return true;
            }),
        body('gamehall')
            .isLength({ min:1 }).withMessage('GameHall Is Required')
            .isLength({ max:36 }).withMessage('GameHall Exceed Max Len 36'),
        body('gamecode')
            .isLength({ min:1 }).withMessage('GameCode Is Required')
            .isLength({ max:36 }).withMessage('GameCode Exceed Max Len 36'),
        body('roundid')
            .isLength({ min:1 }).withMessage('RoundId Is Required')
            .isLength({ max:50 }).withMessage('RoundId Exceed Max Len 50'),
        body('amount')
            .isFloat({ gt: 0 }).withMessage('Amount Invalid'), // gt for > 
        body('mtcode')
            .isLength({ min:1 }).withMessage('MtCode Is Required')
            .isLength({ max:70 }).withMessage('MtCode Exceed Max Len 70'),

        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 
    ];
}

function rollOutValidator(){
    return [
        // Check format
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('account')
            .isLength({ min:1 }).withMessage('Account Is Required')
            .isLength({ max:36 }).withMessage('Account Exceed Max Len 36'),
        body('eventTime')
            .custom(async function(data, {req}){
                // RFC3339
                if (!regexRFC3339.test(data)) throw Error('EventTime Invalid');
                return true;
            }),
        body('gamehall')
            .isLength({ min:1 }).withMessage('GameHall Is Required')
            .isLength({ max:36 }).withMessage('GameHall Exceed Max Len 36'),
        body('gamecode')
            .isLength({ min:1 }).withMessage('GameCode Is Required')
            .isLength({ max:36 }).withMessage('GameCode Exceed Max Len 36'),
        body('roundid')
            .isLength({ min:1 }).withMessage('RoundId Is Required')
            .isLength({ max:50 }).withMessage('RoundId Exceed Max Len 50'),
        body('amount')
            .isFloat({ gt: 0 }).withMessage('Amount Invalid'), // gt for >
        body('mtcode')
            .isLength({ min:1 }).withMessage('MtCode Is Required')
            .isLength({ max:70 }).withMessage('MtCode Exceed Max Len 70'),

        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 
    ];
}

function endRoundValidator(){
    return [
        // Check format
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('account')
            .isLength({ min:1 }).withMessage('Account Is Required')
            .isLength({ max:36 }).withMessage('Account Exceed Max Len 36'),
        body('gamehall')
            .isLength({ min:1 }).withMessage('GameHall Is Required')
            .isLength({ max:36 }).withMessage('GameHall Exceed Max Len 36'),
        body('gamecode')
            .isLength({ min:1 }).withMessage('GameCode Is Required')
            .isLength({ max:36 }).withMessage('GameCode Exceed Max Len 36'),
        body('roundid')
            .isLength({ min:1 }).withMessage('RoundId Is Required')
            .isLength({ max:50 }).withMessage('RoundId Exceed Max Len 50'),
        body('data')
            .isLength({ min:1 }).withMessage('Data Is Required')
            .isLength({ max:999999 }).withMessage('Data Exceed Max Len 999999'),
        body('createTime')
            .custom(async function(data, {req}){
                // RFC3339
                if (!regexRFC3339.test(data)) throw Error('CreateTime Invalid');
                return true;
            }),

        // Special case: data constains an array of JSON string, if we escape "" then GG
        // Sanitize 
        sanitizeBody(['account', 'gamehall', 'gamecode', 'roundid'])
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 

        body('data').custom(async function(data, {req}){
            const dataArray = JSON.parse(data);
            dataArray.forEach(element => {
                if (element.amount === undefined) throw Error('Amount Is Required');
                if (element.amount < 0) throw Error('Amount Invalid');
                
                if (element.mtcode === undefined || element.mtcode.length <= 0) throw Error('MtCode Is Required'); 
                if (element.mtcode.length > 70) throw Error('MtCode Exceed Max Len 70'); 

                if (element.eventtime === undefined) throw Error('EventTime Is Required'); 
                // RFC3339
                if (!regexRFC3339.test(element.eventtime)) throw Error('EventTime Invalid');
                // FK you CQ9, eventtime vs. eventTime ?
            });
            return true;
        }),
    ];
}

function refundValidator(){
    return [
        // Check format
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('mtcode')
            .isLength({ min:1 }).withMessage('MtCode Is Required')
            .isLength({ max:70 }).withMessage('MtCode Exceed Max Len 70'),

        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 
    ];
}

function payOffValidator(){
    return [
        // Check format
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('account')
            .isLength({ min:1 }).withMessage('Account Is Required')
            .isLength({ max:36 }).withMessage('Account Exceed Max Len 36'),
        body('eventTime')
            .custom(async function(data, {req}){
                // RFC3339
                if (!regexRFC3339.test(data)) throw Error('EventTime Invalid');
                return true;
            }),
        body('amount')
            .isFloat({ gt: 0 }).withMessage('Amount Invalid'), // gt for >
        body('mtcode')
            .isLength({ min:1 }).withMessage('MtCode Is Required')
            .isLength({ max:70 }).withMessage('MtCode Exceed Max Len 70'),

        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 
    ];
}

function debitValidator(){
    return [
        // Check format
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('account')
            .isLength({ min:1 }).withMessage('Account Is Required')
            .isLength({ max:36 }).withMessage('Account Exceed Max Len 36'),
        body('eventTime')
            .custom(async function(data, {req}){
                // RFC3339
                if (!regexRFC3339.test(data)) throw Error('EventTime Invalid');
                return true;
            }),
        body('gamehall')
            .isLength({ min:1 }).withMessage('GameHall Is Required')
            .isLength({ max:36 }).withMessage('GameHall Exceed Max Len 36'),
        body('gamecode')
            .isLength({ min:1 }).withMessage('GameCode Is Required')
            .isLength({ max:36 }).withMessage('GameCode Exceed Max Len 36'),
        body('roundid')
            .isLength({ min:1 }).withMessage('RoundId Is Required')
            .isLength({ max:50 }).withMessage('RoundId Exceed Max Len 50'),
        body('amount')
            .isFloat({ gt: 0 }).withMessage('Amount Invalid'), // gt for >
        body('mtcode')
            .isLength({ min:1 }).withMessage('MtCode Is Required')
            .isLength({ max:70 }).withMessage('MtCode Exceed Max Len 70'),

        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 
    ];
}

function creditValidator(){
    return [
        // Check format
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('account')
            .isLength({ min:1 }).withMessage('Account Is Required')
            .isLength({ max:36 }).withMessage('Account Exceed Max Len 36'),
        body('eventTime')
            .custom(async function(data, {req}){
                // RFC3339
                if (!regexRFC3339.test(data)) throw Error('EventTime Invalid');
                return true;
            }),
        body('gamehall')
            .isLength({ min:1 }).withMessage('GameHall Is Required')
            .isLength({ max:36 }).withMessage('GameHall Exceed Max Len 36'),
        body('gamecode')
            .isLength({ min:1 }).withMessage('GameCode Is Required')
            .isLength({ max:36 }).withMessage('GameCode Exceed Max Len 36'),
        body('roundid')
            .isLength({ min:1 }).withMessage('RoundId Is Required')
            .isLength({ max:50 }).withMessage('RoundId Exceed Max Len 50'),
        body('amount')
            .isFloat({ gt: 0 }).withMessage('Amount Invalid'), // gt for >
        body('mtcode')
            .isLength({ min:1 }).withMessage('MtCode Is Required')
            .isLength({ max:70 }).withMessage('MtCode Exceed Max Len 70'),

        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 
    ];
}

module.exports = {
    isAuthorized: isAuthorizedHandler,
    isValidMtcode: isValidMtcodeHandler,
    isValidSession: isValidSessionHandler,
    invalidRoute: invalidRouteHandler,

    checkPlayer: checkPlayerHandler,
    checkPlayerValidate: checkPlayerValidator(),
    balance: balanceHandler,
    balanceValidate: balanceValidator(),
    record: recordHandler,
    recordValidate: recordValidator(),
    
    takeAll: takeAllHandler,
    takeAllValidate: takeAllValidator(),
    bet: betHandler,
    betValidate: betValidator(),
    rollOut: rollOutHandler,
    rollOutValidate: rollOutValidator(),
    
    rollIn: rollInHandler,
    rollInValidate: rollInValidator(),
    endRound: endRoundHandler,
    endRoundValidate: endRoundValidator(),

    refund: refundHandler,
    refundValidate: refundValidator(),
    payOff: payOffHandler,
    payOffValidate: payOffValidator(),

    debit: debitHandler,
    debitValidate: debitValidator(),
    credit: creditHandler,
    creditValidate: creditValidator(),
}
