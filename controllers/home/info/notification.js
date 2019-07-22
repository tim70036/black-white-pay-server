const
    mysql = require('mysql'),
    sqlAsync = require('../../../libs/sqlAsync'),
    { Expo } = require('expo-server-sdk'),
    {
        body,
        validationResult
    } = require('express-validator/check'),
    {
        sanitizeBody
    } = require('express-validator/filter');


// Page rendering
let renderHandler = function (req, res) {
    res.render('home/info/notification', {
        layout: 'home'
    });
};

// Datatable ajax read
let readHandler = async function (req, res) {

    // Init return data (must suit DataTable's format)
    let data = {
        data: []
    };

    // Prepare query
    let sqlString = `SELECT id, content, createtime
                     FROM Notification
                     WHERE uid=?
                    ;`;
    let values = [req.user.id];
    sqlString = mysql.format(sqlString, values);

    // Search all service agents managed by this user
    // Execute query
    try {
        let results = await sqlAsync.query(req.db, sqlString);
        data.data = results;
        return res.json(data);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json(data);
    }

};

// Datatable ajax create
let createHandler = async function (req, res) {

    const result = validationResult(req);

    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json({
            err: true,
            msg: firstError
        });
    }

    // Gather all required data
    const {
        content
    } = req.body;

    // Prepare query
    // Query for insert into Notification
    let sqlStringInsert1 = `INSERT INTO Notification (uid, content) VALUES (?, ?);`;
    let values = [req.user.id, content];
    sqlStringInsert1 = mysql.format(sqlStringInsert1, values);
    
    // !!!!!!!!!!!!!!!!!!! unsolved bug, notification will broadcast to all user no matter which admin
    // Query for NotificationTarget
    let sqlStringInsert2 = `
                                INSERT INTO NotificationTarget (notificationId, uid) 
                                SELECT ?, U.id
                                FROM UserAccount AS U
                                WHERE U.role='member'
                            ;`;

    let sqlStringSelect = `
                                SELECT ExpoToken.token
                                FROM ExpoToken
                                WHERE uid IN (
                                    SELECT U.id
                                    FROM UserAccount AS U
                                    WHERE U.role='member'
                                )
                            ;`;

    // Insert new announcement
    // Execute transaction
    let notificationId;
    try {
        await sqlAsync.query(req.db, 'START TRANSACTION');
        let results = await sqlAsync.query(req.db, sqlStringInsert1);
        notificationId = results.insertId;

        values = [notificationId, req.user.id];
        sqlStringInsert2 = mysql.format(sqlStringInsert2, values);
        results = await sqlAsync.query(req.db, sqlStringInsert2);

        results = await sqlAsync.query(req.db, sqlStringSelect);
        let tokenList = results.map((row) => (row.token));

        // Create a new Expo SDK client
        let expo = new Expo();

        // Create the messages that you want to send to clents
        let messages = [];
        for (const pushToken of tokenList) {
            // Each push token looks like ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]

            // Check that all your push tokens appear to be valid Expo push tokens
            if (!Expo.isExpoPushToken(pushToken)) {
                req.logger.error(`Push token ${pushToken} is not a valid Expo push token`);
                continue;
            }

            // Construct a message (see https://docs.expo.io/versions/latest/guides/push-notifications.html)
            messages.push({
                to: pushToken,
                sound: 'default',
                body: content,
                data: { withSome: 'data' },
            });
        }

        // The Expo push notification service accepts batches of notifications so
        // that you don't need to send 1000 requests to send 1000 notifications. We
        // recommend you batch your notifications to reduce the number of requests
        // and to compress them (notifications with similar content will get
        // compressed).
        let chunks = expo.chunkPushNotifications(messages);
        let tickets = [];
        (async () => {
            // Send the chunks to the Expo push notification service. There are
            // different strategies you could use. A simple one is to send one chunk at a
            // time, which nicely spreads the load out over time:
            for (let chunk of chunks) {
                try {
                    let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                    console.log(ticketChunk);
                    tickets.push(...ticketChunk);
                    // NOTE: If a ticket contains an error code in ticket.details.error, you
                    // must handle it appropriately. The error codes are listed in the Expo
                    // documentation:
                    // https://docs.expo.io/versions/latest/guides/push-notifications#response-format
                } catch (error) {
                    req.logger.error(error);
                }
            }
        })();

    } catch (error) {
        await sqlAsync.query(req.db, 'ROLLBACK'); // rollback transaction if a statement produce error
        req.logger.error(`${error.message}`);
        return res.json({
            err: true,
            msg: 'Server 錯誤'
        });
    }
    await sqlAsync.query(req.db, 'COMMIT'); // commit transaction only if all statement has executed without error

    // Log 
    req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] create a new notification id[${notificationId}]`);

    return res.json({
        err: false,
        msg: 'success'
    });
};

// Datatable ajax delete
let deleteHandler = async function (req, res) {

    const result = validationResult(req);

    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json({
            err: true,
            msg: firstError
        });
    }

    let deleteData = req.body.data;

    // Prepare query
    let sqlStringDel = `DELETE FROM Notification
                        WHERE id IN (?)
                        ;`;
    let values = [ deleteData.map((notification) => notification.id) ]; // bind a list of Notification id to the sql string
    sqlStringDel = mysql.format(sqlStringDel, values);

    // Execute all queries
    try{
        await sqlAsync.query(req.db, 'START TRANSACTION');
        await sqlAsync.query(req.db, sqlStringDel);
    }
    catch(error) {
        await sqlAsync.query(req.db, 'ROLLBACK'); // rollback transaction if a statement produce error
        req.logger.error(`${error.message}`);
        return res.json({err: true, msg: 'Server 錯誤'});
    }
    await sqlAsync.query(req.db, 'COMMIT');  // commit transaction only if all statement has executed without error
    
    // Log 
    for(let i=0 ; i<deleteData.length ; i++) {
        req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] delete notification id[${deleteData[i].id}]`);
    }

    return res.json({
        err: false,
        msg: 'success'
    });
};

// Form data validate generators
// Invoke it to produce a middleware for validating
function createValidator() {
    return [
        // Check format
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each value
        body('content')
            .isLength({
                min: 1
            }).withMessage('內容不可爲空')
            .isLength({
                max: 300
            }).withMessage('內容長度不可超過 300'),
        // Sanitize values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end

    ];
}


function deleteValidator() {
    return [
        // Check format
        // Data must be array
        body('data')
            .isArray().withMessage('Wrong data format')
            .custom(function (data) {
                return data.length < 10000;
            }).withMessage('更改資料數量過多'),

        // All values must be string
        body('data.*.*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('data.*.id')
            .isInt({
                min: 0,
                max: 9999999999
            }).withMessage('Wrong data format'),

        // Sanitize all values 
        sanitizeBody('data.*.*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 


        // Check permission from database
        body('data.*.id').custom(async function (data, {
            req
        }) {

            // Prepare query
            let sqlString = `SELECT id 
                             FROM Notification
                             WHERE uid=? AND id=?`;

            let values = [req.user.id, data];
            sqlString = mysql.format(sqlString, values);

            // Check if this annonuce is valid for this user to delete
            let results;
            try {
                results = await sqlAsync.query(req.db, sqlString);
            } catch (error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }

            if (results.length <= 0) throw Error('刪除無效');

            return true;
        }),
    ];
}

module.exports = {
    render: renderHandler,

    read: readHandler,

    create: createHandler,
    createValidate: createValidator(),

    delete: deleteHandler,
    deleteValidate: deleteValidator(),

};