const
    mysql = require('mysql'),
    sqlAsync = require('../../../libs/sqlAsync'),
    { uploadUserDefaultThumbnail } = require('../../../libs/s3'),
    { body, validationResult } = require('express-validator/check'),
    { sanitizeBody } = require('express-validator/filter'),
    speakeasy = require("speakeasy");



// Page rendering
let renderHandler = async function (req, res) {

    try {
        return res.render('home/personnel/user', { layout: 'home' });
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.render('home/personnel/user', { layout: 'home' });
    }
};

let userSearchHandler = async function (req, res) {
    try {
        const validateResult = validationResult(req);

        // If the form data is invalid
        if (!validateResult.isEmpty()) {
            // Return the first error to client
            let firstError = validateResult.array()[0].msg;
            return res.json({
                err: true,
                msg: firstError
            });
        }

        let sqlString, values;
        const {
            userAccount,
        } = req.body;

        let userAccountString = '';
        if(userAccount.length > 0){
            userAccountString = mysql.format(`WHERE U.account=?`, userAccount);
        }

        sqlString = `SELECT 
                U.id, U.account, U.name, U.GSCash AS gsCash, U.phoneNumber, U.email, S.status,
                DATE_FORMAT(CONVERT_TZ(U.createtime, 'UTC', 'Asia/Shanghai'),'%Y-%m-%d %H:%i:%s ') AS createtime,
                DATE_FORMAT(CONVERT_TZ(U.updatetime, 'UTC', 'Asia/Shanghai'),'%Y-%m-%d %H:%i:%s ') AS updatetime
            FROM UserAccount AS U
            INNER JOIN Status AS S
                ON U.statusId=S.id
            ${userAccountString}
            LIMIT 20000
            `;

        // Execute query
        try {
            let results = await sqlAsync.query(req.db, sqlString);
            // Add a new prop(agent) to return data
            let data = results.map((row) => ({
                ...row,
            }));
            return res.json(data);
        } catch (error) {
            req.logger.error(`${error.message}`);
            return res.json(data);
        }


        
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({
            err: true,
            msg: 'Unknown Failure'
        });
    }
}

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
        passwordConfirm,
        transPwd,
        transPwdConfirm,
        cash,
        email,
        phoneNumber,
    } = req.body;

    // Convert from string
    cash = Number(cash);

    // Generate opt key and store it in UserAccount
    // Access using secret.ascii, secret.hex, or secret.base32.
    let otpKey = speakeasy.generateSecret().ascii;

    // Prepare query
    // Query for insert into UserAccount
    let sqlStringInsert = `INSERT INTO UserAccount (account, name, password, transPwd, role, otpKey, email, phoneNumber) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`;
    values = [account, name, password, transPwd, 'member', otpKey, email, phoneNumber];
    sqlStringInsert = mysql.format(sqlStringInsert, values);


    // Insert new member
    // Execute transaction
    try {
        await sqlAsync.query(req.db, 'START TRANSACTION');
        await sqlAsync.query(req.db, sqlStringInsert);
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
    req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] create a new user account[${account}] role[member]`);

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
    // Query for update all members
    let sqlStringTmp = `
                        UPDATE UserAccount
                        SET name=?, email=?, phoneNumber=?
                        WHERE id=?
                        ;`;
    let sqlStringUpdate = '';
    for (let i = 0; i < updateData.length; i++) {
        let element = updateData[i];
        
        let values = [element.name, element.email, element.phoneNumber, element.id];
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
        req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] update user roleId[${updateData[i].id}] `);
    }

    return res.json({
        err: false,
        msg: 'success'
    });
};


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
        body('phoneNumber')
            .optional({
                checkFalsy: true
            }) // Use optional for isInt, this allows input to be "", 0, null and false, however we check whether it is string above, so it is fine
            .matches(/((?=(09))[0-9]{10})$/, 'g').withMessage('請輸入10位數電話號碼'),
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
        body('data.*.phoneNumber')
            .optional({
                checkFalsy: true
            }) // Use optional for isInt, this allows input to be "", 0, null and false, however we check whether it is string above, so it is fine
            .matches(/((?=(09))[0-9]{10})$/, 'g').withMessage('請輸入10位數電話號碼'),
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
            if (req.user.role === 'admin') {
                sqlString = `SELECT U.account FROM UserAccount AS U WHERE U.id=?;`;
            } else {
                // Invalid role
                throw Error('更新無效');
            }
            values = [data];
            sqlString = mysql.format(sqlString, values);
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


let userSearchValidator = function () {
    return [
        // Check format
        // All values must be string

        body('userAccount')
            .isString().withMessage('Wrong data format')
            .isLength({
                max: 20
            }).withMessage('會員名稱長度不可超過 20'),

        // Sanitize all values 
        sanitizeBody(['userAccount'])
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end
    ];
};

module.exports = {
    render: renderHandler,

    create: createHandler,
    createValidate: createValidator(),

    update: updateHandler,
    updateValidate: updateValidator(),

    search: userSearchHandler,
    searchValidate: userSearchValidator(),
};