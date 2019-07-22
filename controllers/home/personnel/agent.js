const
    mysql = require('mysql'),
    sqlAsync = require('../../../libs/sqlAsync'),
    { body, validationResult } = require('express-validator/check'),
    { uploadUserDefaultThumbnail } = require('../../../libs/s3'),
    { sanitizeBody } = require('express-validator/filter'),
    speakeasy = require("speakeasy");



// Page rendering
let renderHandler = async function (req, res) {

    // Determine all stores managed by this user
    // Prepare query
    let sqlString, values;

    sqlString = `SELECT U.name, U.account
                FROM StoreInfo AS Store
                INNER JOIN UserAccount AS U
                    ON Store.uid=U.id 
                `;

    if (req.user.role === 'store') {
        sqlString += `WHERE Store.id=?;`;
    } else if (req.user.role === 'admin') {
        sqlString += `WHERE Store.adminId=?;`;
    } else {
        // Invalid role
        return res.render('home/personnel/agent', {
            layout: 'home'
        });
    }
    values = [req.user.roleId];
    sqlString = mysql.format(sqlString, values);

    // Search all stores managed by this user
    // Render page with stores' data
    // Execute query
    try {
        let results = await sqlAsync.query(req.db, sqlString);
        return res.render('home/personnel/agent', {
            layout: 'home',
            stores: results
        });
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.render('home/personnel/agent', {
            layout: 'home'
        });
    }
};

// Datatable ajax read
let readHandler = async function (req, res) {

    // Init return data (must suit DataTable's format)
    let data = {
        data: []
    };

    // Determine all agents managed by this user
    // Prepare query
    let sqlString, values;

    sqlString = `SELECT 
                    U1.account, U1.name, U1.email, U1.phoneNumber, U1.GSCash AS gsCash,
                    Ag.id, Ag.cash, Ag.credit, Ag.comment, Ag.bindingCode,
                    AB.totalCash, AB.totalAvail, 
                    S.status, U2.name AS store, 
                    DATE_FORMAT(CONVERT_TZ(Ag.createtime, 'UTC', 'Asia/Shanghai'),'%Y-%m-%d %H:%i:%s ') AS createtime,
                    DATE_FORMAT(CONVERT_TZ(Ag.updatetime, 'UTC', 'Asia/Shanghai'),'%Y-%m-%d %H:%i:%s ') AS updatetime
                FROM AgentInfo AS Ag
                INNER JOIN AgentBalance AS AB
                        ON Ag.id = AB.id
                INNER JOIN UserAccount AS U1
                    ON Ag.uid=U1.id 
                INNER JOIN Status AS S
                    ON U1.statusId=S.id
                `;

    if (req.user.role === 'store') {
        sqlString += `  INNER JOIN StoreInfo AS Store
                            ON Ag.storeId=Store.id AND Ag.storeId=?
                        INNER JOIN UserAccount AS U2
                            ON Store.uid=U2.id 
                        ;`;
    } else if (req.user.role === 'admin') {
        sqlString += `  INNER JOIN StoreInfo AS Store
                            ON Ag.storeId=Store.id AND Store.adminId=?
                        INNER JOIN UserAccount AS U2
                            ON Store.uid=U2.id 
                        ;`;
    } else {
        // Invalid role
        return res.json(data);
    }
    values = [req.user.roleId];
    sqlString = mysql.format(sqlString, values);
    // Search all agents managed by this user
    // Execute query
    try {
        let results = await sqlAsync.query(req.db, sqlString);
        // Add a new prop(store) to return data
        data.data = results.map((row) => ({
            ...row,
        }));
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
    let {
        name,
        account,
        password,
        transPwd,
        storeAccount,
        bindingCode,
        cash,
        credit,
        phoneNumber,
        email,
        comment
    } = req.body;
    // Convert from string
    cash = Number(cash);
    credit = Number(credit);

    // Prepare query
    let sqlString = `SELECT Store.*, U.name
                    FROM StoreInfo AS Store
                    INNER JOIN UserAccount AS U
                        ON Store.uid=U.id AND U.account=?
                    ;`;
    let values = [storeAccount];
    sqlString = mysql.format(sqlString, values);

    // Get the store of the new agent
    // Execute query
    let store;
    try {
        let results = await sqlAsync.query(req.db, sqlString);

        // Check result
        if (results.length <= 0) throw Error(`cannot find store info of this user account[${storeAccount}] role[store]`);
        store = results[0];
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({
            err: true,
            msg: 'Server 錯誤'
        });
    }

    // Generate opt key and store it in UserAccount
    // Access using secret.ascii, secret.hex, or secret.base32.
    let otpKey = speakeasy.generateSecret().ascii;

    // Prepare query
    // Query for insert into UserAccount
    let sqlStringInsert1 = `INSERT INTO UserAccount (account, name, password, transPwd, role, otpKey, email, phoneNumber) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`;
    values = [account, name, password, transPwd, 'agent', otpKey, email, phoneNumber];
    sqlStringInsert1 = mysql.format(sqlStringInsert1, values);

    // Query for insert into AgentInfo
    let sqlStringInsert2 = `INSERT INTO AgentInfo (
                                uid, storeId, bindingCode,
                                cash, credit, comment) 
                            VALUES ((SELECT id FROM UserAccount WHERE account=?), ?, ?, ?, ?, ?) 
                            ;`;
    values = [account, store.id, bindingCode, cash, credit, comment];
    sqlStringInsert2 = mysql.format(sqlStringInsert2, values);

    // Query for update storeInfo cash and frozenBalance
    let sqlStringUpdate = ` UPDATE StoreInfo
                            SET cash=cash-?
                            WHERE id=?
                            ;`;
    values = [cash, store.id];
    sqlStringUpdate = mysql.format(sqlStringUpdate, values);

    // Query for transaction record
    let sqlStringRecord1 = `INSERT INTO StoreTransaction 
                            (uid, transTypeCode, amount, relatedId, relatedName, storeId, comment)
                            VALUES (?, ?, ?, (SELECT id FROM UserAccount WHERE account=?), ?, ?, ?);`;
    values = [store.uid, 0, cash * -1, account, name, store.id, '創建人員'];
    sqlStringRecord1 = mysql.format(sqlStringRecord1, values);

    let sqlStringRecord2 = `INSERT INTO StoreTransaction 
                            (uid, transTypeCode, amount, relatedId, relatedName, storeId, comment)
                            VALUES ((SELECT id FROM UserAccount WHERE account=?), ?, ?, ?, ?, ?, ?);`;
    values = [account, 1, cash, store.uid, store.name, store.id, '創建人員'];
    sqlStringRecord2 = mysql.format(sqlStringRecord2, values);

    // No need for transaction if cash = 0
    if (cash === 0) {
        sqlStringRecord1 = ``;
        sqlStringRecord2 = ``;
    }

    // Insert new agent
    // Execute transaction
    try {
        await sqlAsync.query(req.db, 'START TRANSACTION');
        await sqlAsync.query(req.db, sqlStringInsert1 + sqlStringInsert2 + sqlStringUpdate + sqlStringRecord1 + sqlStringRecord2);
        await uploadUserDefaultThumbnail(req, account);
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
    req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] create a new user account[${account}] role[agent] cash[${cash}] credit[${credit}] storeId[${store.id}]`);


    return res.json({
        err: false,
        msg: 'success'
    });
};

// Datatable ajax update
let updateHandler = async function (req, res) {

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

    // Receive data array
    let updateData = req.body.data;

    // Prepare query
    // Query for update all agents
    let sqlStringTmp = `UPDATE AgentInfo 
                        SET credit=?, comment=?
                        WHERE id=?
                        ;
                        UPDATE UserAccount
                        SET name=?, phoneNumber=?, email=?
                        WHERE id=?
                        ;`;
    let sqlStringUpdate = '';
    for (let i = 0; i < updateData.length; i++) {
        let element = updateData[i];
        let tmp = `SELECT uid FROM AgentInfo WHERE id=?;`;
        let sqlString = mysql.format(tmp, element.id);
        let result = await sqlAsync.query(req.db, sqlString);
        let values = [
            element.credit, element.comment, element.id, element.name, element.phoneNumber, element.email, result[0].uid
        ];
        sqlStringUpdate += mysql.format(sqlStringTmp, values);
    }

    // Execute all queries
    try {
        await sqlAsync.query(req.db, 'START TRANSACTION');
        await sqlAsync.query(req.db, sqlStringUpdate);
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
    for (let i = 0; i < updateData.length; i++) {
        req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] update user roleId[${updateData[i].id}] role[agent] credit[${updateData[i].credit}]`);
    }

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

    // Prepare query, get store for each agent
    let sqlString = `SELECT 
                        Ag.id AS id, Store.id AS storeId, Store.uid AS storeUid
                    FROM AgentInfo AS Ag
                    INNER JOIN StoreInfo AS Store 
                        ON Ag.storeId=Store.id
                    WHERE Ag.id IN (?)
                    ;`;
    let values = [deleteData.map((obj) => (obj.id))]; // bind a list of agent id to the sql string
    sqlString = mysql.format(sqlString, values);

    // Get store for each agent
    // Execute query
    let storeList;
    try {
        let results = await sqlAsync.query(req.db, sqlString);

        // Check result
        if (results.length <= 0) throw Error(`cannot find store of these users roleId[${deleteData.map(obj => obj.id).join()}] role[agent]`);

        // Augment storeId for each agent in update data 
        deleteData.forEach(function (agent) {
            agent.storeId = results.find(row => row.id === Number(agent.id)).storeId;
        });

        // Get a distinct list of all involved store
        storeList = results.map((row) => ({
            id: row.storeId,
            uid: row.storeUid
        }));
        storeList = storeList.reduce(function (newList, store) {
            if (!newList.find(element => element.id === store.id))
                newList.push(store);
            return newList;
        }, []);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({
            err: true,
            msg: 'Server 錯誤'
        });
    }

    // Ready to delete
    // Start Trnasaction first
    try {
        await sqlAsync.query(req.db, 'START TRANSACTION');

        // For each store, delete its agents
        for (let i = 0; i < storeList.length; i++) {
            let curStore = storeList[i];
            let curAgentList = deleteData.filter(agent => agent.storeId === curStore.id);

            // Prepare query, get total cash of all the agents that pepare to be deleted
            let sqlStringCash = `SELECT SUM(cash) AS totalCash
                                FROM AgentInfo
                                WHERE id IN(?)
                                `;
            values = [curAgentList.map((agent) => agent.id)]; // bind a list of agent id to the sql string
            sqlStringCash = mysql.format(sqlStringCash, values);

            // Get total cash of all the agents that pepare to be deleted
            // Execute query
            let results = await sqlAsync.query(req.db, sqlStringCash);

            // Check result
            if (results.length <= 0) throw Error(`Cannot calculate SUM of all agents' cash`);
            let totalCash = results[0].totalCash;

            //req.logger.debug({totalCash});

            // Now, delete all agents
            // Prepare query, return cash to store?
            let sqlStringDel = `DELETE Usr
                                FROM UserAccount AS Usr
                                WHERE Usr.id IN (   SELECT Ag.uid 
                                                    FROM AgentInfo AS Ag
                                                    WHERE Ag.id in (?) )
                                ;`;
            values = [curAgentList.map((agent) => agent.id)]; // bind a list of agent id to the sql string
            sqlStringDel = mysql.format(sqlStringDel, values);

            let sqlStringUpdate = `  UPDATE StoreInfo
                                    SET cash=cash+?
                                    WHERE id=?
                                    ;`;
            values = [totalCash, curStore.id];
            sqlStringUpdate = mysql.format(sqlStringUpdate, values);

            // Query for transaction record
            let sqlStringRecord1 = `INSERT INTO StoreTransaction 
                                    (uid, transTypeCode, amount, relatedName, storeId, comment)
                                    VALUES (?, ?, ?, ?, ?, ?);`;
            values = [curStore.uid, 1, totalCash, 'N/A', curStore.id, '刪除人員'];
            sqlStringRecord1 = mysql.format(sqlStringRecord1, values);

            // No need for transaction if cash = 0
            if (totalCash === 0) {
                sqlStringRecord1 = ``;
            }

            // Execute all queries
            await sqlAsync.query(req.db, sqlStringDel + sqlStringUpdate + sqlStringRecord1);

            // log
            for (let i = 0; i < curAgentList.length; i++) {
                req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] delete user roleId[${curAgentList[i].id}] role[agent]`);
            }
            req.logger.verbose(`roleId[${curStore.id}] role[store] receive cash[${totalCash}] through deleting users`);
        }

    } catch (error) {
        await sqlAsync.query(req.db, 'ROLLBACK'); // rollback transaction if a statement produce error
        req.logger.error(`${error.message}`);
        return res.json({
            err: true,
            msg: 'Server 錯誤'
        });
    }
    await sqlAsync.query(req.db, 'COMMIT'); // commit transaction only if all statement has executed without error

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
        body('name')
            .isLength({
                min: 1
            }).withMessage('名稱不可爲空')
            .isLength({
                max: 20
            }).withMessage('名稱長度不可超過 20'),
        body('account')
            .isLength({
                min: 1
            }).withMessage('帳號不可爲空')
            .isLength({
                max: 20
            }).withMessage('帳號長度不可超過 20')
            .isAlphanumeric().withMessage('帳號只能含有數字或英文字母'),
        body('password')
            .isLength({ min:8 }).withMessage('密碼長度至少為8')
            .isLength({ max:20 }).withMessage('密碼長度不可超過 20')
            .isAlphanumeric().withMessage('密碼只能含有數字或英文字母'),
        body('passwordConfirm')
            .custom(function (data, {
                req
            }) {
                return data === req.body.password;
            }).withMessage('確認密碼與密碼不相同'),
        body('transPwd')
            .isLength({ min:6 }).withMessage('交易密碼需為六位數')
            .isLength({ max:6 }).withMessage('交易密碼需為六位數')
            .isInt().withMessage('交易密碼只能含有數字'),
        body('transPwdConfirm')
            .custom(function (data, {
                req
            }) {
                return data === req.body.transPwd;
            }).withMessage('確認交易密碼與交易密碼不相同'),
        body('email')
            .isLength({
                min: 0,
                max: 40
            }).withMessage('信箱長度不可超過 40')
            .optional({
                checkFalsy: true
            }) // Use optional for isInt, this allows input to be "", 0, null and false, however we check whether it is string above, so it is fine
            .isEmail({
                min: 0
            }).withMessage('信箱格式錯誤'),

        body('storeAccount')
            .isLength({
                min: 1
            }).withMessage('店家不可爲空')
            .isLength({
                max: 20
            }).withMessage('店家帳號錯誤'),
        body('bindingCode')
            .isLength({
                min: 6,
                max: 6
            }).withMessage('綁定碼長度需為6')
            .isInt({
                min: 0,
                max: 999999
            }).withMessage('綁定碼需要是六位數'),
        body('cash')
            .isNumeric({
                min: 0, max: 999999999999999
            }).withMessage('寶石額度必須介於 0 ～ 999999999999999 之間'),
        body('credit')
            .isNumeric({
                min: -999999999999999, max: 999999999999999
            }).withMessage('信用額度必須是數字'),

        body('phoneNumber')
            .optional({
                checkFalsy: true
            }) // Use optional for isInt, this allows input to be "", 0, null and false, however we check whether it is string above, so it is fine
            .matches(/((?=(09))[0-9]{10})$/, 'g').withMessage('請輸入10位數電話號碼'),
        body('comment')
            .isLength({
                min: 0,
                max: 40
            }).withMessage('備註長度不可超過 40'),

        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end

        // Check duplicate account in database
        body('account').custom(async function (data, {
            req
        }) {

            // Prepare query
            let sqlString = `SELECT * 
                            FROM UserAccount 
                            WHERE account=?`;
            let values = [data];
            sqlString = mysql.format(sqlString, values);

            // Check if duplicate account exists
            let results;
            try {
                results = await sqlAsync.query(req.db, sqlString);
            } catch (error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }

            if (results.length > 0) throw Error('使用者帳號重複');

            return true;
        }),

        // Check store account against this user
        body('storeAccount').custom(async function (data, {
            req
        }) {
            if (req.user.role === 'store' && req.user.account === data) {
                return true; // store account must equal to the user's account, if that user is a store
            }

            // Prepare query
            // Based on different of this user, we will use different query string
            let sqlString, values;

            sqlString = `SELECT Store.id
                        FROM StoreInfo AS Store
                        INNER JOIN UserAccount AS U
                            ON Store.uid=U.id 
                        `;

            if (req.user.role === 'admin') {
                sqlString += `WHERE Store.adminId=? AND U.account=?;`;
            } else {
                // All other circumstances are invalid
                throw Error('店家錯誤');
            }

            values = [req.user.roleId, data];
            sqlString = mysql.format(sqlString, values);

            // Check if this store is managed by this user
            let results;
            try {
                results = await sqlAsync.query(req.db, sqlString);
            } catch (error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }

            if (results.length <= 0) throw Error('新增無效');

            return true;

        }),
        body('bindingCode').custom(async function (data, {
            req
        }) {

            // Prepare query
            let sqlString = `SELECT * 
                            FROM AgentInfo 
                            WHERE bindingCode=?`;
            let values = [data];
            sqlString = mysql.format(sqlString, values);

            // Check if duplicate account exists
            let results;
            try {
                results = await sqlAsync.query(req.db, sqlString);
            } catch (error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }

            if (results.length > 0) throw Error('綁定碼重複');

            return true;
        }),
    ];
}

function updateValidator() {
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
        body('data.*.name')
            .isLength({
                min: 1
            }).withMessage('名稱不可爲空')
            .isLength({
                max: 20
            }).withMessage('名稱長度不可超過 20'),
        body('data.*.credit')
            .isNumeric({
                min: -999999999999999, max: 999999999999999
            }).withMessage('信用額度必須是數字'),
        body('data.*.email')
            .isLength({
                min: 0,
                max: 40
            }).withMessage('信箱長度不可超過 40')
            .optional({
                checkFalsy: true
            }) // Use optional for isInt, this allows input to be "", 0, null and false, however we check whether it is string above, so it is fine
            .isEmail({
                min: 0
            }).withMessage('信箱格式錯誤'),

        body('data.*.phoneNumber')
            .optional({
                checkFalsy: true
            }) // Use optional for isInt, this allows input to be "", 0, null and false, however we check whether it is string above, so it is fine
            .matches(/((?=(09))[0-9]{10})$/, 'g').withMessage('請輸入10位數電話號碼'),
        body('data.*.comment')
            .isLength({
                min: 0,
                max: 40
            }).withMessage('備註長度不可超過 40'),


        // Sanitize all values 
        sanitizeBody('data.*.*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end

        // Check permission from database
        body('data.*.id').custom(async function (data, {
            req
        }) {

            // Prepare query
            // Based on different of this user, we will use different query string
            let sqlString, values;

            sqlString = `SELECT Ag.id
                        FROM AgentInfo AS Ag
                        `;

            if (req.user.role === 'store') {
                sqlString += `WHERE Ag.StoreId=? AND Ag.id=?;`;
            } else if (req.user.role === 'admin') {
                sqlString += `  INNER JOIN StoreInfo AS Store
                                    ON Ag.storeId=Store.id AND Store.adminId=?
                                WHERE Ag.id=?
                                ;`;
            } else {
                // Invalid role
                throw Error('更新無效');
            }
            values = [req.user.roleId, data];
            sqlString = mysql.format(sqlString, values);

            // Check if this agent is valid for this user to update
            let results;
            try {
                results = await sqlAsync.query(req.db, sqlString);
            } catch (error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }

            if (results.length <= 0) throw Error('更新無效');

            return true;
        }),
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
            // Based on different of this user, we will use different query string
            let sqlString, values;

            sqlString = `SELECT Ag.id
                        FROM AgentInfo AS Ag
                        `;

            if (req.user.role === 'store') {
                sqlString += `WHERE Ag.storeId=? AND Ag.id=?;`;
            } else if (req.user.role === 'admin') {
                sqlString += `  INNER JOIN StoreInfo AS Store
                                    ON Ag.storeId=Store.id AND Store.adminId=?
                                WHERE Ag.id=?
                                ;`;
            } else {
                // Invalid role
                throw Error('刪除無效');
            }
            values = [req.user.roleId, data];
            sqlString = mysql.format(sqlString, values);

            // Check if this agent is valid for this user to delete
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

    update: updateHandler,
    updateValidate: updateValidator(),

    delete: deleteHandler,
    deleteValidate: deleteValidator(),
};