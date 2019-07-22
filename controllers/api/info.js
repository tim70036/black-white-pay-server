const
    { body, validationResult } = require('express-validator/check'),
    { sanitizeBody } = require('express-validator/filter'),
    mysql = require('mysql'),
    sqlAsync = require('../../libs/sqlAsync');

let announementListHandler = async function(req, res, next) {

    let sqlString = `
                        SELECT An.title AS title, An.imageSrc AS image
                        FROM Announcement AS An
                        ORDER BY An.id DESC
                        LIMIT 5
                    `;
    let values = [req.user.id];
    sqlString = mysql.format(sqlString, values);

    let announcementList = [];
    try {
        announcementList = await sqlAsync.query(req.db, sqlString);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({ errCode : 2, msg: 'Server 錯誤' });
    }
    return res.json({ errCode : 0, msg: 'success', data: announcementList });

};

let notitficationListHandler = async function(req, res, next) {

    let sqlString = `
                        SELECT 
                            N.content AS content,
                            U.imageSrc AS thumbnail,
                            CONVERT_TZ(N.createtime, 'UTC', 'Asia/Shanghai') AS createtime
                        FROM NotificationTarget AS NT
                        INNER JOIN Notification AS N
                            ON N.id=NT.notificationId
                        INNER JOIN UserAccount AS U
                            ON U.id=N.uid
                        WHERE NT.uid=?
                        ORDER BY N.id DESC
                    `;
    let values = [req.user.id];
    sqlString = mysql.format(sqlString, values);

    let notificationList = [];
    try {
        notificationList = await sqlAsync.query(req.db, sqlString);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({ errCode : 2, msg: 'Server 錯誤' });
    }
    return res.json({ errCode : 0, msg: 'success', data: notificationList });

};

let notitficationPushTokenHandler = async function(req,res, next) {
    const result = validationResult(req);

    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json({ errCode: 1, msg: firstError });
    }

    // Gather all required data
    const {   
        token, 
    } = req.body;

    const uid = req.user.id;

    try{
        // Search for token in db
        let sqlString = `SELECT id FROM ExpoToken WHERE token=?;`;
        let values = [token];
        sqlString = mysql.format(sqlString, values);

        
        let results = await sqlAsync.query(req.db, sqlString);

        // If token is new, store it otherwise update it
        if(results.length <= 0) {
            sqlString = `INSERT INTO ExpoToken (token, uid) VALUES (?, ?);`;
            values = [token, uid];
            sqlString = mysql.format(sqlString, values);
        } else {
            sqlString = `UPDATE ExpoToken SET uid=? WHERE token=?`;
            values = [uid, token];
            sqlString = mysql.format(sqlString, values);
        }
        results = await sqlAsync.query(req.db, sqlString);
    }
    catch(error) {
        req.logger.error(`${error.message}`);
        return res.json({ errCode: 2, msg: 'Server 錯誤' });
    }
    
    // Log
    req.logger.verbose(`uid[${uid}] role[member] push expo token[${token}]`);

    return res.json({ errCode: 0, msg: 'success' });
};

// Form data validate generators
// Invoke it to produce a middleware for validating
function notificationPushTokenValidator(){
    return [
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('token')
            .isLength({ min:1 }).withMessage('Token 不可爲空')
            .isLength({ max:200 }).withMessage('Token 長度不可超過 200'),

        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 
    ];
}

module.exports = {
    pushToken: notitficationPushTokenHandler,
    pushTokenValidate: notificationPushTokenValidator(),
    notitficationList: notitficationListHandler,
    announementList: announementListHandler,
};