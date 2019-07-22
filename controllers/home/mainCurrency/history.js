const
    mysql = require('mysql'),
    sqlAsync = require('../../../libs/sqlAsync'),
    emoji = require('node-emoji'),
    {
        body,
        validationResult
    } = require('express-validator/check'),
    {
        sanitizeBody
    } = require('express-validator/filter'),
    moment = require('moment');

let historyRenderHandler = async function (req, res) {

    try {

        // Get transType
        let sqlString = ` SELECT * FROM TransType;`;
        let results = await sqlAsync.query(req.db, sqlString);
        let transTypeData = results;

        return res.render('home/mainCurrency/history', {
            layout: 'home',
            transTypeData: transTypeData
        });
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.render('home/mainCurrency/history', {
            layout: 'home'
        });
    }

};

let historySearchHandler = async function (req, res) {

    const result = validationResult(req);

    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json({
            err: true,
            msg: firstError,
            data: []
        });
    }

    try {

        // Gather form data
        let {
            datetimes,
            transTypeCode,
            account,
        } = req.body;

        // Process data, prepare sql string
        datetimes = datetimes.split('-');
        let startTime = datetimes[0].trim();
        let endTime = datetimes[1].trim();
        let timeString = mysql.format(`AND (MT.createtime BETWEEN ? AND ?)`, [startTime, endTime]);

        let transTypeString = ``;
        if (transTypeCode.length > 0) {
            transTypeString = mysql.format(`AND MT.transTypeCode=?`, [transTypeCode]);
        }



        let sqlString, values, results;
        // Case 1 : search for specific account
        if (account && account.length > 0) {

            // Validate permission
			// If account is not found, then target user is invalid
			sqlString = `SELECT U.id AS uid
						 FROM UserAccount AS U
						 WHERE U.account = ?;`;
			values = [account];
			sqlString = mysql.format(sqlString, values);
			results = await sqlAsync.query(req.db, sqlString);
            if (results.length <= 0) return res.json({
                err: true,
                msg: '搜尋無效',
                data: []
            });
			let targetUser = results[0];

            // Get the transaction info of the user
            sqlString = `SELECT 
                            U.account, U.name, U.role, 
                            MT.id AS tid, MT.transTypeCode, MT.amount, MT.relatedName, MT.comment, 
                            DATE_FORMAT(CONVERT_TZ(MT.createtime, 'UTC', 'Asia/Shanghai'),'%Y-%m-%d %H:%i:%s ') AS createtime
                        FROM UserAccount AS U
                        INNER JOIN MainTransaction AS MT
                            ON MT.uid=U.id
                        WHERE U.id=? ${timeString}  ${transTypeString}
                        `;
            values = [targetUser.uid];
            sqlString = mysql.format(sqlString, values);
        }
        // Case 4 : search all user managed by this user
        else {
            sqlString = getManagedTransString(req, timeString, transTypeString);
        }

        // Add limit 
		sqlString += ` ORDER BY createtime desc LIMIT 20000;`;

        // Execute query
        results = await sqlAsync.query(req.db, sqlString);

        // Emojify, the relatedName field might contain emoji(from DpqAccount name)
        results.forEach(function (row) {
            row.relatedName = emoji.emojify(row.relatedName);
        });

        let historyData = results;

        // Return data
        return res.json({
            err: false,
            msg: 'success',
            data: historyData
        });
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({
            err: true,
            msg: 'Server 錯誤',
            data: []
        });
    }

};

// Produce sql string to get  all transactions managed by this user
// Special case : all service agents manage their admin's account, they don't have wallet themselves
function getManagedTransString(req, timeString, transTypeString) {

    // Prepare query
    let sqlString;
    if (req.user.role === 'admin') {
        sqlString = `
                        SELECT U.id AS uid, U.account, U.name, U.role, 
                        MT.id AS tid, MT.transTypeCode, MT.amount, MT.relatedName, MT.comment, 
                        DATE_FORMAT(CONVERT_TZ(MT.createtime, 'UTC', 'Asia/Shanghai'),'%Y-%m-%d %H:%i:%s ') AS createtime
                        FROM MainTransaction AS MT
                        INNER JOIN UserAccount AS U
                            ON MT.uid=U.id
                        WHERE 1 ${timeString} ${transTypeString}
                    `;
    } else {
        // Invalid role
        throw Error('invalid role');
    }
    return sqlString;
}

function historySearchValidator() {
    return [
        // Check format
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        body('transTypeCode')
            .isLength({
                min: 0,
                max: 20
            }).withMessage('交易類型代碼長度不可超過 20')
            .optional({
                checkFalsy: true
            }) // Use optional for isInt, this allows input to be "", 0, null and false, however we check whether it is string above, so it is fine
            .isInt({
                min: 0
            }).withMessage('交易類型代碼必須是數字'),
        body('account')
            .isLength({
                max: 20
            }).withMessage('帳號長度不可超過 20')
            .optional({
                checkFalsy: true
            }) // Use optional for isInt, this allows input to be "", 0, null and false, however we check whether it is string above, so it is fine
            .isAlphanumeric().withMessage('帳號只能含有數字或英文字母'),

        body('datetimes')
            .isLength({
                max: 40
            }).withMessage('時間長度不可超過 40')
            .custom(function (data) {

                // Check format
                let datetimes = data.split('-');
                if (datetimes.length !== 2) return false;
                let re = /^\d\d\d\d\/(0?[1-9]|1[0-2])\/(0?[1-9]|[12][0-9]|3[01]) (00|0[0-9]|[0-9]|1[0-9]|2[0-3]):([0-9]|[0-5][0-9])$/;
                for (let i = 0; i < datetimes.length; i++) {
                    let d = datetimes[i].trim();
                    if (!d.match(re)) {
                        throw Error(`時間格式錯誤`);
                    }
                }

                // Check range
                let startTime = moment(datetimes[0].trim(), 'YYYY/MM/DD HH:mm');
                let endTime = moment(datetimes[1].trim(), 'YYYY/MM/DD HH:mm');
                let days = endTime.diff(startTime, 'days');
                if (days > 60) throw Error(`搜尋天數超過 60 天`);

                return true;
            }),

        // Sanitize all values except datetimes
        sanitizeBody(['transTypeCode', 'account'])
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end
    ];
}

module.exports = {
    render: historyRenderHandler,
    search: historySearchHandler,
    searchValidate: historySearchValidator(),
};