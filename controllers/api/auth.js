const
    passport = require('passport'),
    { body, validationResult } = require('express-validator/check'),
    { sanitizeBody } = require('express-validator/filter'),
    moment = require('moment'),
    fetch = require('node-fetch'),
    { URL } = require('url'),
    mysql = require('mysql'),
    speakeasy = require("speakeasy"),
    sqlAsync = require('../../libs/sqlAsync'),
    notification = require('../../libs/notification'),
    { uploadUserDefaultThumbnail } = require('../../libs/s3');

// Handler for authorization
let isLoginHandler = function(req, res, next){

    // User not login
    if(!req.isAuthenticated()) {
        req.logger.verbose(`not logined`);
        return res.json({ errCode: 87, msg: '使用者未登入' });
    }

    req.logger.verbose(`authorized, using account[${req.user.account}] role[${req.user.role}]`);
    // User has logined
    return next();
};

const phoneRedisPrefix = `phone:`;
const phoneRedisExpireTime = 5 * 60; // min
let pushPhoneHandler = async function(req,res, next) {
    const result = validationResult(req);
    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json({ errCode: 1, msg: firstError });
    }

    // Gather all required data
    const {   
        phoneNumber
    } = req.body;

    // Generate verification code
    const low = 100000, high = 999999;
    const verifyCode = (Math.floor(Math.random() * (high - low) + low)).toString();

    // Genrate phone data
    let phoneData = JSON.stringify({
        verifyCode: verifyCode,
        status: 0, // not verified
        createtime: moment().format(),
    });

    // SMS message
    let message = `感謝使用 黑白Pay ${String.fromCharCode(6)}您的驗證碼是：${verifyCode} ${String.fromCharCode(6)}有效期間為${phoneRedisExpireTime}秒`;

    try{
        // Insert phone data to redis with expire time
        await req.redis.setAsync(`${phoneRedisPrefix}${phoneNumber}`, phoneData, 'EX', phoneRedisExpireTime);

        // Generate url to send SMS request to Mitake
        let url = new URL(`${process.env.MITAKE_HOST}/api/mtk/SmSend`);
        url.searchParams.append('username', process.env.MITAKE_USER);
        url.searchParams.append('password', process.env.MITAKE_PWD);
        url.searchParams.append('dstaddr', phoneNumber);
        url.searchParams.append('smbody', message);
        url.searchParams.append('CharsetURL', 'UTF8'); // required, fucking Mitake API, fuck your doc

        // Request Mitake to send message to that phone
        let response = await fetch(url);
        response = await response.text();
        // We don't give a shit about the response
    }
    catch(error) {
        req.logger.error(`${error.message}`);
        return res.json({ errCode: 2, msg: 'Server 錯誤' });
    }
  
    // Log
    req.logger.verbose(`phoneNumber[${phoneNumber}] generate verification verifyCode[${verifyCode}]`);

    return res.json({ errCode: 0, msg: 'success' });
};

let verifyPhoneHandler = async function(req,res, next) {
    const result = validationResult(req);
    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json({ errCode: 1, msg: firstError });
    }

    // Gather all required data
    const {
        phoneNumber,
        verifyCode,
    } = req.body;

    try{
        let phoneDataString = await req.redis.getAsync(`${phoneRedisPrefix}${phoneNumber}`);
        let phoneData = JSON.parse(phoneDataString);

        if (!phoneData) {
            return res.json({ errCode: 1, msg: '電話資料不存在，請重新領取驗證碼' });
        }

        // Wrong Code
        if (phoneData.verifyCode !== verifyCode) {
            return res.json({ errCode: 1, msg: '驗證碼錯誤' });
        }

        // Right code
        // Update phone data
        phoneData.status = 1; // verified
        phoneData.verifytime = moment().format();
        phoneDataString = JSON.stringify(phoneData);

        // Insert phone data to redis with expire time
        await req.redis.setAsync(`${phoneRedisPrefix}${phoneNumber}`, phoneDataString, 'EX', phoneRedisExpireTime);
    }
    catch(error) {
        req.logger.error(`${error.message}`);
        return res.json({ errCode: 2, msg: 'Server 錯誤' });
    }

    // Log
    req.logger.verbose(`phoneNumber[${phoneNumber}] pass verification with verifyCode[${verifyCode}]`);

    return res.json({ errCode: 0, msg: 'success' });
};


let forgetHandler = async function(req,res, next) {
    const result = validationResult(req);
    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json({ errCode: 1, msg: firstError });
    }

    // Gather all required data
    const {   
        account, 
        password, 
        transPwd,
    } = req.body;

    // Prepare query
    // Query for insert into UserAccount
    let sqlStringUpdate = ` 
                            UPDATE UserAccount 
                            SET password=?, transPwd=?
                            WHERE account=?
                            ;`;
    let values = [password, transPwd, account];
    sqlStringUpdate = mysql.format(sqlStringUpdate, values);

    // Update user
    try{
        await sqlAsync.query(req.db, sqlStringUpdate);
    }
    catch(error) {
        req.logger.error(`${error.message}`);
        return res.json({ errCode: 2, msg: 'Server 錯誤' });
    }
  
    // Log
    req.logger.verbose(`account[${account}] forget password and set new password[${password}] transPwd[${transPwd}]`);

    return res.json({ errCode: 0, msg: 'success' });
};


let registerHandler = async function(req,res, next) {
    const result = validationResult(req);
    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json({ errCode: 1, msg: firstError });
    }

    // Gather all required data
    const {   
        name, 
        account, 
        password, 
        transPwd,
    } = req.body;

    // Generate opt key and store it in UserAccount
    // Access using secret.ascii, secret.hex, or secret.base32.
    let otpKey = speakeasy.generateSecret().ascii;

    // Prepare query
    // Query for insert into UserAccount
    let sqlStringInsert = `INSERT INTO UserAccount (account, password, transPwd, name, role, otpKey, phoneNumber) VALUES (?, ?, ?, ?, ?, ?, ?);`;
    let values = [account, password, transPwd, name, 'member', otpKey, account];
    sqlStringInsert = mysql.format(sqlStringInsert, values);

    // Insert new user
    // Execute transaction
    try{
        await sqlAsync.query(req.db, 'START TRANSACTION');
        await sqlAsync.query(req.db, sqlStringInsert);
        await uploadUserDefaultThumbnail(req, account);

        // let content = `會員 ${name} 註冊成功!`;
	    // let targetUid = [results.insertId];
        // await notification.createNotification(req, 1, targetUid, content);
    }
    catch(error) {
        await sqlAsync.query(req.db, 'ROLLBACK');
        req.logger.error(`${error.message}`);
        return res.json({ errCode: 2, msg: 'Server 錯誤' });
    }
    await sqlAsync.query(req.db, 'COMMIT');
    // Log
    req.logger.verbose(`account[${account}] name[${name}] role[member] registered`);

    return res.json({ errCode: 0, msg: 'success' });
};

let loginHandler = function(req,res, next) {
    const result = validationResult(req);
    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json({ errCode: 1, msg: firstError });
    }

    // Use custom callback to send resposne to ajax request, since passport can't deal with ajax form by default
    passport.authenticate('api-local', function(err, user, info){
        // errCode 
        // 0 : auth success
        // 1 : auth failed
        // 2 : server error

        // Error occured
        if (err) { 
            return res.json({ errCode : 2, msg: 'Server 錯誤' });
        }

        // Authentication failed
        if (!user) {
            return res.json({ errCode : 1, msg: '帳號密碼錯誤' });
        }

        // Authentication success, make passport logIn manually
        req.logIn(user, function(err) {
            if (err) {
                return res.json({ errCode : 2, msg: 'Server 錯誤' });
            }

            // Reset brute prevention
            req.brute.reset(function () {
                return res.json({ errCode : 0, msg: 'success', data: user });
            });  
        });

    })(req, res, next); // pass req, res, next into passport
};


let logoutHandler = function(req,res){
    // Using only req.logout is not sufficient
    req.session.destroy((err) => {
        if(err) {
            return res.json({ errCode : 2, msg: 'Server 錯誤' });
        }
        req.logout();
        return res.json({ errCode : 0, msg: 'success' });
    });
};



// Form data validate generators
// Invoke it to produce a middleware for validating
function registerPushPhoneValidator(){
    return [
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('phoneNumber')
            .matches(/((?=(09))[0-9]{10})$/, 'g').withMessage('帳號必須為電話號碼'),

        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 

        // Check duplicate account in database
        body('phoneNumber').custom(async function(data, {req}){

            // Prepare query
            // Remeber to use charset utf8mb4_bin in DB
            let sqlString =`SELECT * 
                            FROM UserAccount 
                            WHERE account=?`;
            let values = [data];
            sqlString = mysql.format(sqlString, values);

            // Check if duplicate account exists
            let results;
            try {
                results = await sqlAsync.query(req.db, sqlString);
            }
            catch(error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }

            if(results.length > 0) throw Error('此電話號碼已被使用');

            return true;
        }),
    ];
}

function forgetPushPhoneValidator(){
    return [
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('phoneNumber')
            .matches(/((?=(09))[0-9]{10})$/, 'g').withMessage('帳號必須為電話號碼'),

        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 

        // Check if account exist in database
        body('phoneNumber').custom(async function(data, {req}){

            // Prepare query
            // Remeber to use charset utf8mb4_bin in DB
            let sqlString =`SELECT * 
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

function loginValidator(){
    return [
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('account')
            .isLength({ min: 1 }).withMessage('帳號不可爲空')
            .isLength({ max: 20 }).withMessage('帳號長度不可超過 20')
            .isAlphanumeric().withMessage('帳號只能含有數字或英文字母'),
        body('password')
            .isLength({ min:8 }).withMessage('密碼長度至少為8')
            .isLength({ max:20 }).withMessage('密碼長度不可超過 20')
            .isAlphanumeric().withMessage('密碼只能含有數字或英文字母'),
        

        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 
    ];
}

function verifyPhoneValidator(){
    return [
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('phoneNumber')
            .matches(/((?=(09))[0-9]{10})$/, 'g').withMessage('帳號必須為電話號碼'),
        body('verifyCode')
            .isLength({ min:6 }).withMessage('驗證碼需為6位數')
            .isLength({ max:6 }).withMessage('驗證碼需為6位數')
            .isInt().withMessage('驗證碼只能含有數字'),

        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 
    ];
}

function forgetValidator(){
    return [
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('account')
            .matches(/((?=(09))[0-9]{10})$/, 'g').withMessage('帳號必須為電話號碼'),
        body('password')
            .isLength({ min:8 }).withMessage('密碼長度至少為8')
            .isLength({ max:20 }).withMessage('密碼長度不可超過 20')
            .isAlphanumeric().withMessage('密碼只能含有數字或英文字母'),
        body('transPwd')
            .isLength({ min:6 }).withMessage('交易密碼需為六位數')
            .isLength({ max:6 }).withMessage('交易密碼需為六位數')
            .isInt().withMessage('交易密碼只能含有數字'),

        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 
        
        // Check account verified or not
        body('account').custom(async function(data, {req}){
            let phoneData;
            try {
                let phoneDataString = await req.redis.getAsync(`${phoneRedisPrefix}${data}`);
                phoneData = JSON.parse(phoneDataString);
            }
            catch(error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }

            // Verified or not
            if(!phoneData) throw Error('電話號碼未通過驗證或超時，請重新驗證');
            if(phoneData.status !== 1) throw Error('電話號碼尚未驗證');

            // Verfied, delete data from redis to prevent security flaw
            try {
                await req.redis.delAsync(`${phoneRedisPrefix}${data}`);
            }
            catch(error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }

            return true;
        }),

        // Check if account exist in database
        body('account').custom(async function(data, {req}){

            // Prepare query
            // Remeber to use charset utf8mb4_bin in DB
            let sqlString =`SELECT * 
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

function registerValidator(){
    return [
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('account')
            .matches(/((?=(09))[0-9]{10})$/, 'g').withMessage('帳號必須為電話號碼'),
        body('password')
            .isLength({ min:8 }).withMessage('密碼長度至少為8')
            .isLength({ max:20 }).withMessage('密碼長度不可超過 20')
            .isAlphanumeric().withMessage('密碼只能含有數字或英文字母'),
        body('transPwd')
            .isLength({ min:6 }).withMessage('交易密碼需為六位數')
            .isLength({ max:6 }).withMessage('交易密碼需為六位數')
            .isInt().withMessage('交易密碼只能含有數字'),
        body('name')
            .isLength({ min:1 }).withMessage('名稱不可爲空')
            .isLength({ max:20 }).withMessage('名稱長度不可超過 20'),

        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 

        // Check account verified or not
        body('account').custom(async function(data, {req}){
            let phoneData;
            try {
                let phoneDataString = await req.redis.getAsync(`${phoneRedisPrefix}${data}`);
                phoneData = JSON.parse(phoneDataString);
            }
            catch(error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }

            // Verified or not
            if(!phoneData) throw Error('電話號碼未通過驗證或超時，請重新驗證');
            if(phoneData.status !== 1) throw Error('電話號碼尚未驗證');

            // Verfied, delete data from redis to prevent security flaw
            try {
                await req.redis.delAsync(`${phoneRedisPrefix}${data}`);
            }
            catch(error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }

            return true;
        }),

        // Check duplicate account in database
        body('account').custom(async function(data, {req}){

            // Prepare query
            // Remeber to use charset utf8mb4_bin in DB
            let sqlString =`SELECT * 
                            FROM UserAccount 
                            WHERE account=?`;
            let values = [data];
            sqlString = mysql.format(sqlString, values);

            // Check if duplicate account exists
            let results;
            try {
                results = await sqlAsync.query(req.db, sqlString);
            }
            catch(error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }

            if(results.length > 0) throw Error('使用者帳號重複');

            return true;
        }),

    ];
}

module.exports = {
    isLogin: isLoginHandler,
    login: loginHandler,
    loginValidate: loginValidator(),
    logout: logoutHandler,

    pushPhone: pushPhoneHandler,
    registerPushPhoneValidate: registerPushPhoneValidator(),

    verifyPhone: verifyPhoneHandler,
    verifyPhoneValidate: verifyPhoneValidator(),

    register: registerHandler,
    registerValidate: registerValidator(),

    forget: forgetHandler,
    forgetValidate: forgetValidator(),
    forgetPushPhonerValidate: forgetPushPhoneValidator(),
};

