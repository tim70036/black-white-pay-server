const
	mysql = require('mysql'),
	sqlAsync = require('./sqlAsync'),
	{ Expo } = require('expo-server-sdk');


// targetUids (Array) : all the target Uid
// content (String) : notification content
// Please execute it in try catch
let createNotification = async function (req, originUid, targetUids, content) {

    // Prepare query
    // Query for insert into Notification
    let sqlStringInsert1 = `INSERT INTO Notification (uid, content) VALUES (?, ?);`;
    let values = [originUid, content];
    sqlStringInsert1 = mysql.format(sqlStringInsert1, values);
    
    // !!!!!!!!!!!!!!!!!!! unsolved bug, notification will broadcast to all user no matter which admin
    // Query for NotificationTarget
    let sqlStringInsert2 = `
                                INSERT INTO NotificationTarget (notificationId, uid) 
                                SELECT ?, U.id
                                FROM UserAccount AS U
                                WHERE U.id IN (?);
                            ;`;

    let sqlStringSelect = `
                                SELECT ExpoToken.token
                                FROM ExpoToken
                                WHERE uid IN (?);
                            ;`;

    // Insert new announcement
    // Execute transaction
    let notificationId;
    try {
        await sqlAsync.query(req.db, 'START TRANSACTION');
        let results = await sqlAsync.query(req.db, sqlStringInsert1);
        notificationId = results.insertId;

        values = [notificationId, targetUids];
		sqlStringInsert2 = mysql.format(sqlStringInsert2, values);
        results = await sqlAsync.query(req.db, sqlStringInsert2);

		values = [targetUids];
		sqlStringSelect = mysql.format(sqlStringSelect, values);
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
        // return res.json({
        //     err: true,
        //     msg: 'Server 錯誤'
		// });
		throw Error(`${error.message}`);
    }
    await sqlAsync.query(req.db, 'COMMIT'); // commit transaction only if all statement has executed without error

    // Log 
    req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] create a new notification id[${notificationId}]`);

    // return res.json({
    //     err: false,
    //     msg: 'success'
    // });
};

module.exports = { createNotification };