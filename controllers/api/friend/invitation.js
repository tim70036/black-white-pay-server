const
    { body, validationResult } = require('express-validator/check'),
    { sanitizeBody } = require('express-validator/filter'),
    mysql = require('mysql'),
    sqlAsync = require('../../../libs/sqlAsync');


let listHandler = async function(req, res, next) {
    let sqlString = `
                        SELECT
                            U.account AS account,
                            U.name AS name,
                            U.imageSrc AS thumbnail
                        FROM FriendRequest AS FR
                        INNER JOIN UserAccount AS U
                            ON U.id=FR.uid
                        WHERE FR.requestUid=?
                    `;
    let values = [req.user.id];
    sqlString = mysql.format(sqlString, values);

    let invitationtList = [];
    try {
        invitationtList = await sqlAsync.query(req.db, sqlString);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({ errCode : 2, msg: 'Server 錯誤' });
    }
    return res.json({ errCode : 0, msg: 'success', data: invitationtList });
};

let acceptHandler = async function(req, res, next) {
    const result = validationResult(req);
    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json({ errCode: 1, msg: firstError });
    }

    // Gather all required data
    const {
        account
    } = req.body;

    // Prepare query
    // Query for delete friend request
    let sqlStringDelete =   ` 
                                DELETE FR FROM FriendRequest AS FR
                                WHERE FR.uid=(SELECT U.id FROM UserAccount AS U WHERE U.account=?) AND FR.requestUid=?
                            ;`;
    let values = [account, req.user.id];
    sqlStringDelete = mysql.format(sqlStringDelete, values);

    // Query for insert friend
    let sqlStringInsert =   ` 
                                INSERT INTO Friend (uid, friendUid)
                                VALUES 
                                    ( ?, (SELECT U.id FROM UserAccount AS U WHERE U.account=?) ),
                                    ((SELECT U.id FROM UserAccount AS U WHERE U.account=?), ?  )
                            ;`;
    values = [
        req.user.id, account,
        account, req.user.id,
    ];
    sqlStringInsert = mysql.format(sqlStringInsert, values);

    // Execute transaction
	// Create friend
	try {
		await sqlAsync.query(req.db, 'START TRANSACTION');
		await sqlAsync.query(req.db, sqlStringDelete + sqlStringInsert);
	}
	catch (error) {
		await sqlAsync.query(req.db, 'ROLLBACK'); // rollback transaction if a statement produce error
		req.logger.error(`${error.message}`);
		return res.json({ errCode: 2, msg: 'Server 錯誤' });
	}
	await sqlAsync.query(req.db, 'COMMIT');  // commit transaction only if all statement has executed without error
  
    // Log
    req.logger.verbose(`uid[${req.user.id}] role[member] accept friend request from account[${account}]`);

    return res.json({ errCode: 0, msg: 'success' });
};

let declineHandler = async function(req, res, next) {
    const result = validationResult(req);
    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json({ errCode: 1, msg: firstError });
    }

    // Gather all required data
    const {
        account
    } = req.body;

    // Prepare query
    // Query for delete friend request
    let sqlStringDelete =   ` 
                                DELETE FR FROM FriendRequest AS FR
                                WHERE FR.uid=(SELECT U.id FROM UserAccount AS U WHERE U.account=?) AND FR.requestUid=?
                            ;`;
    let values = [account, req.user.id];
    sqlStringDelete = mysql.format(sqlStringDelete, values);

    // Delete friend request
    try{
        await sqlAsync.query(req.db, sqlStringDelete);
    }
    catch(error) {
        req.logger.error(`${error.message}`);
        return res.json({ errCode: 2, msg: 'Server 錯誤' });
    }
  
    // Log
    req.logger.verbose(`uid[${req.user.id}] role[member] delete friend request from account[${account}]`);

    return res.json({ errCode: 0, msg: 'success' });
};

function acceptValidator(){
    return [
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('account')
            .isLength({ min: 1 }).withMessage('帳號不可爲空')
            .isLength({ max: 20 }).withMessage('帳號長度不可超過 20')
            .isAlphanumeric().withMessage('帳號只能含有數字或英文字母')
            .custom(function (data, { req }) { return data !== req.user.account; }).withMessage('好友不可為自己'),

        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 

        // Check if account exist in database
        body('account').custom(async function(data, {req}){

            // Prepare query
            // Remeber to use charset utf8mb4_bin in DB
            let sqlString =`SELECT id 
                            FROM UserAccount 
                            WHERE account=?`;
            let values = [data];
            sqlString = mysql.format(sqlString, values);

            // Check if account exists
            let results;
            try {
                results = await sqlAsync.query(req.db, sqlString);
            }
            catch(error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }

            if(results.length <= 0) throw Error('此帳號不存在');

            return true;
        }),

        // Check if request to this user exist in database
        body('account').custom(async function(data, {req}){

            // Prepare query
            let sqlString =`
                                SELECT FR.id
                                FROM FriendRequest AS FR 
                                INNER JOIN UserAccount AS U
                                    ON U.id=FR.uid
                                WHERE FR.requestUid=? AND U.account=?
                            `;
            let values = [req.user.id, data];
            sqlString = mysql.format(sqlString, values);

            // Check if request to this user  exists
            let results;
            try {
                results = await sqlAsync.query(req.db, sqlString);
            }
            catch(error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }

            if(results.length <= 0) throw Error('邀請不存在');

            return true;
        }),

        // Check if already friend
        body('account').custom(async function(data, {req}){

            // Prepare query
            let sqlString =`
                                SELECT F.id
                                FROM Friend AS F
                                INNER JOIN UserAccount AS U
                                    ON U.id=F.friendUid
                                WHERE F.uid=? AND U.account=?
                            `;
            let values = [req.user.id, data];
            sqlString = mysql.format(sqlString, values);

            // Check if already friends
            let results;
            try {
                results = await sqlAsync.query(req.db, sqlString);
            }
            catch(error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }

            if(results.length > 0) throw Error('對方已經是您的好友');

            return true;
        }),
    ];
}


module.exports = {
    list: listHandler,
    accept: acceptHandler,
    acceptValidate: acceptValidator(),
    decline: declineHandler,
    declineValidate: acceptValidator(), // same as accept
};