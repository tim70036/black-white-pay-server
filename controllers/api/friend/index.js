const
    request = require('./request'),
    invitation = require('./invitation');

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
                        FROM Friend AS F
                        INNER JOIN UserAccount AS U
                            ON U.id=F.friendUid
                        WHERE F.uid=?
                    `;
    let values = [req.user.id];
    sqlString = mysql.format(sqlString, values);

    let friendList = [];
    try {
        friendList = await sqlAsync.query(req.db, sqlString);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({ errCode : 2, msg: 'Server 錯誤' });
    }
    return res.json({ errCode : 0, msg: 'success', data: friendList });
};

let detailHandler = async function(req, res, next) {
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
    // User data
    let sqlStringSelect =   `
                                SELECT 
                                    U.account AS account,
                                    U.name AS name,
                                    U.imageSrc AS thumbnail
                                FROM UserAccount AS U
                                WHERE U.account=?
                            ;`;
    let values = [account];
    sqlStringSelect = mysql.format(sqlStringSelect, values);

    // Is friend
    let sqlStringCheck =    `
                                SELECT F.id
                                FROM Friend AS F
                                INNER JOIN UserAccount AS U
                                    ON U.id=F.friendUid
                                WHERE F.uid=? AND U.account=?
                            ;`;
    values = [req.user.id, account];
    sqlStringCheck = mysql.format(sqlStringCheck, values);

    let friendDetail = {};
    try {
        let result = await sqlAsync.query(req.db, sqlStringSelect);
        friendDetail = { ...result[0] };

        // Is friend
        result = await sqlAsync.query(req.db, sqlStringCheck);
        friendDetail.isFriend = (result.length > 0) ? true : false;
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({ errCode : 2, msg: 'Server 錯誤' });
    }
    return res.json({ errCode : 0, msg: 'success', data: friendDetail });
};


let deleteHandler = async function(req, res, next) {
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
    // Query for delete friend
    let sqlStringDelete =   ` 
                                DELETE F FROM Friend AS F
                                WHERE 
                                    (F.uid=? AND F.friendUid=(SELECT U.id FROM UserAccount AS U WHERE U.account=?))
                                OR
                                    (F.uid=(SELECT U.id FROM UserAccount AS U WHERE U.account=?) AND F.friendUid=?)
                            ;`;
    let values = [
        req.user.id, account,
        account, req.user.id,
    ];
    sqlStringDelete = mysql.format(sqlStringDelete, values);

    // Delete friend
    try{
        await sqlAsync.query(req.db, sqlStringDelete);
    }
    catch(error) {
        req.logger.error(`${error.message}`);
        return res.json({ errCode: 2, msg: 'Server 錯誤' });
    }
  
    // Log
    req.logger.verbose(`uid[${req.user.id}] role[member] delete friend with account[${account}]`);

    return res.json({ errCode: 0, msg: 'success' });
};


// Form data validate generators
// Invoke it to produce a middleware for validating
function detailValidator(){
    return [
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('account')
            .isLength({ min: 1 }).withMessage('帳號不可爲空')
            .isLength({ max: 20 }).withMessage('帳號長度不可超過 20')
            .isAlphanumeric().withMessage('帳號只能含有數字或英文字母'),

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
    ];
}

function deleteValidator(){
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
    ];
}

module.exports = {
    list: listHandler,
    detail: detailHandler,
    detailValidate: detailValidator(),
    delete: deleteHandler,
    deleteValidate: deleteValidator(),

    request: request,
    invitation: invitation,
};