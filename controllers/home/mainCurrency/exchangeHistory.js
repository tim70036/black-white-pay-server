const
    mysql = require('mysql'),
    emoji = require('node-emoji'),
    {
        body,
        validationResult
    } = require('express-validator/check'),
    {
        sanitizeBody
    } = require('express-validator/filter'),
    moment = require('moment'),
    util = require('../../../libs/util'),
    sqlAsync = require('../../../libs/sqlAsync');

let historyRenderHandler = async function (req, res) {

    try {

        // Get transType
        let sqlString = ` SELECT * FROM TransType;`;
        let results = await sqlAsync.query(req.db, sqlString);
        let transTypeData = results.reduce(function (arr, row) {
            if (row.transTypeCode === 6 || row.transTypeCode === 7) arr.push(row);
            return arr;
        }, []);

        // Get storeCurrency
        let storeCurrencyData = await getStoreCurrency(req);


        return res.render('home/mainCurrency/exchangeHistory', {
            layout: 'home',
            transTypeData: transTypeData,
            storeCurrencyData: storeCurrencyData
        });
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.render('home/mainCurrency/exchangeHistory', {
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

    // Collect all accounts infos managed by this user, including this user itself
    let managedAccounts;
    try {
        managedAccounts = await getManagedUsers(req);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({
            err: true,
            msg: 'Server 錯誤',
            data: []
        });
    }

    try {

        // Gather form data
        let {
            datetimes,
            transTypeCode,
            transCurrency,
            account,
        } = req.body;

        // Process data, prepare sql string
        datetimes = datetimes.split('-');
        let startTime = datetimes[0].trim();
        let endTime = datetimes[1].trim();
        let timeString = mysql.format(`AND (ER.createtime BETWEEN ? AND ?)`, [startTime, endTime]);

        let transTypeString = ``;
        if (transTypeCode.length > 0) {
            transTypeString = mysql.format(`AND ER.transTypeCode=?`, [transTypeCode]);
        }

        let transCurrencyString = ``;
        if (transCurrency.length > 0) {
            transCurrencyString = mysql.format(`AND ER.storeId=?`, [transCurrency]);
        }



        let sqlString, values, results;
        // Case 1 : search for specific account
        if (account && account.length > 0) {

            // Validate permission
            // If account is not found, then target user is invalid
            let targetUser = managedAccounts.find(row => (row.account === account));
            if (!targetUser) return res.json({
                err: true,
                msg: '搜尋無效',
                data: []
            });

            // Determine update table for sender and receiver 
            targetUser.table = util.roleToTable(targetUser.role);

            // Get the transaction info of the user
            sqlString = `SELECT 
                            U.account, U.name, U.role, 
                            ER.id AS tid, ER.transTypeCode, ER.amount, ER.comment, store.currencyName,
                            DATE_FORMAT(CONVERT_TZ(ER.createtime, 'UTC', 'Asia/Shanghai'),'%Y-%m-%d %H:%i:%s ') AS createtime
                        FROM UserAccount AS U
                        INNER JOIN ?? AS P
                            ON P.uid=U.id
                        INNER JOIN ExchangeRecord AS ER
							ON ER.uid=U.id
						INNER JOIN StoreInfo AS store
							ON ER.storeId = store.id
                        WHERE U.id=? ${timeString}  ${transTypeString} ${transCurrencyString}
                        `;
            values = [targetUser.table, targetUser.uid];
            sqlString = mysql.format(sqlString, values);
        }
        // Case 2 : search all user managed by this user
        else {
            sqlString = getManagedTransString(req, timeString, transTypeString, transCurrencyString);
        }

        // Add limit 
        sqlString += ` ORDER BY createtime desc LIMIT 20000;`;

        // Execute query
        results = await sqlAsync.query(req.db, sqlString);

        // Emojify, the relatedName field might contain emoji(from DpqAccount name)
        results.forEach(function (row) {
            row.relatedName = emoji.emojify(row.relatedName);
        });

        // Return data
        return res.json({
            err: false,
            msg: 'success',
            data: results
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

// Determine all accounts managed by this user
// It returns an array contains all account infos managed by this user, including himself
// Special case : all service agents manage their admin's account, they don't have wallet themselves
// Please execute it in try catch 
async function getManagedUsers(req) {
    // Prepare query
    let sqlString, values;
    if (req.user.role === 'admin') {
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

                        WHERE store.adminId=?
                    )
                    UNION
                    (   
                        SELECT U.id AS uid, U.account, Ag.id, U.name, Ag.cash, U.role
                        FROM AgentInfo AS Ag
                        INNER JOIN UserAccount AS U
                            ON U.id=Ag.uid

                        INNER JOIN StoreInfo AS store
                            ON store.id=Ag.storeId AND store.adminId=?
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
                            ON store.id=Ag.storeId AND store.adminId=?
                    )
                    ;`;
        values = [req.user.roleId, req.user.roleId, req.user.roleId, req.user.roleId];
        sqlString = mysql.format(sqlString, values);
    } else if (req.user.role === 'store') {
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

                        INNER JOIN StoreInfo AS store
                            ON store.id=Ag.storeId AND store.id=?
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
                            ON store.id=Ag.storeId AND store.id=?
                    )
                    ;`;
        values = [req.user.roleId, req.user.roleId, req.user.roleId];
        sqlString = mysql.format(sqlString, values);
    } else if(req.user.role === 'agent') {
		sqlString = `
					(   
						SELECT U.id AS uid, U.account, Ag.id, U.name, Ag.cash, U.role
						FROM AgentInfo AS Ag
						INNER JOIN UserAccount AS U
							ON U.id=Ag.uid

						WHERE Ag.id=?
					)
					UNION
					(
						SELECT U.id AS uid, U.account, Mem.id, U.name, Mem.cash, U.role
						FROM MemberInfo AS Mem
						INNER JOIN UserAccount AS U
							ON U.id=Mem.uid

						INNER JOIN AgentInfo AS Ag
							ON Ag.id=Mem.agentId
						WHERE Ag.id=?
					)
					;`;
		values = [req.user.roleId, req.user.roleId];
		sqlString = mysql.format(sqlString, values);
    } else {
        // Invalid role
        throw Error('invalid role');
    }

    // Execute query
    let results = await sqlAsync.query(req.db, sqlString);

    return results;
}

// Produce sql string to get  all transactions managed by this user
// Special case : all service agents manage their admin's account, they don't have wallet themselves
function getManagedTransString(req, timeString, transTypeString, transCurrencyString) {

    // Prepare query
    let sqlString, values;
    if (req.user.role === 'agent') {
		sqlString = `(
						SELECT U.id AS uid, U.account, U.name, U.role, 
						ER.id AS tid, ER.transTypeCode, ER.amount, ER.comment, store.currencyName,
						DATE_FORMAT(CONVERT_TZ(ER.createtime, 'UTC', 'Asia/Shanghai'),'%Y-%m-%d %H:%i:%s ') AS createtime
						FROM MemberInfo AS Mem
						INNER JOIN UserAccount AS U
							ON U.id=Mem.uid
						INNER JOIN ExchangeRecord AS ER
							ON ER.uid=Mem.uid

						INNER JOIN AgentInfo AS Ag
							ON Ag.id=Mem.agentId
						INNER JOIN StoreInfo AS store
							ON ER.storeId = store.id
						WHERE Ag.id=? ${timeString} ${transTypeString} ${transCurrencyString}
					)`;
		values = [req.user.roleId];
		sqlString = mysql.format(sqlString, values);
	} else if (req.user.role === 'store') {
        sqlString = `(
                        SELECT U.id AS uid, U.account, U.name, U.role, 
                        ER.id AS tid, ER.transTypeCode, ER.amount, ER.comment, store.currencyName,
                        DATE_FORMAT(CONVERT_TZ(ER.createtime, 'UTC', 'Asia/Shanghai'),'%Y-%m-%d %H:%i:%s ') AS createtime
                        FROM MemberInfo AS Mem
                        INNER JOIN UserAccount AS U
                            ON U.id=Mem.uid
                        INNER JOIN ExchangeRecord AS ER
                            ON ER.uid=Mem.uid


                        INNER JOIN AgentInfo AS Ag
							ON Ag.id=Mem.agentId
						INNER JOIN StoreInfo AS store
							ON ER.storeId = store.id
                        WHERE Ag.storeId=? ${timeString} ${transTypeString} ${transCurrencyString}
                    )
                    `;
        values = [req.user.roleId];
        sqlString = mysql.format(sqlString, values);
    } else if (req.user.role === 'admin') {
        sqlString = `(
                        SELECT U.id AS uid, U.account, U.name, U.role, 
                        ER.id AS tid, ER.transTypeCode, ER.amount, ER.comment, store.currencyName, 
                        DATE_FORMAT(CONVERT_TZ(ER.createtime, 'UTC', 'Asia/Shanghai'),'%Y-%m-%d %H:%i:%s ') AS createtime
                        FROM UserAccount AS U
                        INNER JOIN ExchangeRecord AS ER
                            ON ER.uid=U.id
						INNER JOIN StoreInfo AS store
							ON ER.storeId = store.id
                        WHERE U.role='member' ${timeString} ${transTypeString} ${transCurrencyString}
                    )
                    `;
    } else {
        // Invalid role
        throw Error('invalid role');
    }

    return sqlString;
}

async function getStoreCurrency(req) {
    // preapre query
    let sqlString, values, results;

    if (req.user.role === 'admin') {
        sqlString = `   SELECT store.id, store.currencyName, U.name
                        FROM StoreInfo AS store
                        INNER JOIN UserAccount AS U
                            ON U.id = store.uid
                        INNER JOIN AdminInfo AS Adm
                            ON store.adminId = Adm.id
                        WHERE Adm.uid=?
                    ;`;
        values = [req.user.id];
        sqlString = mysql.format(sqlString, values);
    } else if (req.user.role === 'store') {
        sqlString = `   SELECT store.id, store.currencyName, U.name
                        FROM StoreInfo AS store
                        INNER JOIN UserAccount AS U
                            ON U.id = store.uid
                        WHERE store.uid=?
                    ;`;
        values = [req.user.id];
        sqlString = mysql.format(sqlString, values);
    } else if (req.user.role === 'agent') {
        sqlString = `   SELECT store.id, store.currencyName, U.name
                        FROM StoreInfo AS store
                        INNER JOIN UserAccount AS U
                            ON U.id = store.uid
                        INNER JOIN AgentInfo AS Ag
                            ON Ag.storeId = store.id
                        WHERE Ag.uid=?
                    ;`;
        values = [req.user.id];
        sqlString = mysql.format(sqlString, values);
    } else {
        // Invalid role
        throw Error('invalid role');
    }

    results = await sqlAsync.query(req.db, sqlString);
    return results;
}

function exchangeHistorySearchValidator() {
    return [
        // Check format
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        body('transTypeCode')
            .isLength({
                min: 0,
                max: 20
            }).withMessage('交換類型代碼長度不可超過 20')
            .optional({
                checkFalsy: true
            }) // Use optional for isInt, this allows input to be "", 0, null and false, however we check whether it is string above, so it is fine
            .isInt({
                min: 0
            }).withMessage('交換類型代碼必須是數字'),
        body('account')
            .isLength({
                max: 20
            }).withMessage('帳號長度不可超過 20')
            .optional({
                checkFalsy: true
            }) // Use optional for isInt, this allows input to be "", 0, null and false, however we check whether it is string above, so it is fine
            .isAlphanumeric().withMessage('帳號只能含有數字或英文字母'),
        body('transCurrency')
            .isLength({
                min: 0,
                max: 20
            }).withMessage('交換幣別代碼長度不可超過 20')
            .optional({
                checkFalsy: true
            }) // Use optional for isInt, this allows input to be "", 0, null and false, however we check whether it is string above, so it is fine
            .isInt({
                min: 0
            }).withMessage('交換幣別代碼必須是數字'),

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
        sanitizeBody(['transTypeCode', 'account', 'transCurrency'])
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end

        body('transCurrency').custom(async function(data, {req}){
            if(req.user.role === 'store' || req.user.role === 'agent') {
                if(data === '') {
                    throw Error(`交換幣別代碼錯誤`);
                }
            }

            return true;
        })

    ];
}

module.exports = {
    render: historyRenderHandler,
    search: historySearchHandler,
    searchValidate: exchangeHistorySearchValidator(),
};