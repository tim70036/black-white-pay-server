const 
    mysql = require('mysql'),
    sqlAsync = require('../../../libs/sqlAsync'),
    { uploadStoreAdDefaultImage, uploadUserDefaultThumbnail } = require('../../../libs/s3'),
    { body, validationResult } = require('express-validator/check'),
    { sanitizeBody } = require('express-validator/filter'),
    speakeasy = require("speakeasy");



// Page rendering
let renderHandler = function(req,res){
    res.render('home/personnel/store', {layout : 'home'});
};

// Datatable ajax read
let readHandler = async function(req,res){

    // Init return data (must suit DataTable's format)
    let data = {
        data : []
    };

    // Get the admin of this user
    let admin;
    try{
        admin = await getAdmin(req);
    }
    catch(error) {
        req.logger.error(`${error.message}`);
        return res.json({err: true, msg: 'Server 錯誤'});
    }
    
    // Prepare query
    let sqlStringRead = `SELECT 
                            U.name, U.account, U.GSCash AS gsCash, U.email, U.phoneNumber,
                            Store.id, Store.cash, Store.credit, SB.totalCash, SB.totalAvail, 
                            S.status, Store.comment, Store.inflow, Store.outflow,
                            DATE_FORMAT(CONVERT_TZ(Store.createtime, 'UTC', 'Asia/Shanghai'),'%Y-%m-%d %H:%i:%s ') AS createtime,
                            DATE_FORMAT(CONVERT_TZ(Store.updatetime, 'UTC', 'Asia/Shanghai'),'%Y-%m-%d %H:%i:%s ') AS updatetime
                        FROM StoreInfo AS Store
                        INNER JOIN StoreBalance AS SB
                            ON Store.id = SB.id
                        INNER JOIN UserAccount AS U
                            ON Store.uid=U.id 
                        INNER JOIN Status AS S
                            ON U.statusId=S.id
                        WHERE Store.adminId=?`;
    let values = [admin.id];
    sqlStringRead = mysql.format(sqlStringRead, values);
    // Search all store of this admin
    // Execute query
    try {
        let results = await sqlAsync.query(req.db, sqlStringRead);

        // Return result
        data.data = results.map( (row) => ({ ...row})  );
        return res.json(data);
    }
    catch(error) {
        req.logger.error(`${error.message}`);
        return res.json(data); 
    }
};

// Datatable ajax create
let createHandler = async function(req,res){

    const result = validationResult(req);

    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json({err: true, msg: firstError});
    }

    // Gather all required data
    let 
        {   name, 
            account, 
            password, 
            transPwd,
            currencyName,
            cash,
            credit,
            phoneNumber,
            email,
            inflow,
            outflow,
            exchangeRate,
            comment } = req.body;
    
    // Convert from string
    cash = Number(cash);
    credit = Number(credit);

    // Get the admin of this user
    let admin;
    try{
        admin = await getAdmin(req);
    }
    catch(error) {
        req.logger.error(`${error.message}`);
        return res.json({err: true, msg: 'Server 錯誤'});
    }

    // Generate opt key and store it in UserAccount
    // Access using secret.ascii, secret.hex, or secret.base32.
    let otpKey = speakeasy.generateSecret().ascii;

    // Prepare query
    // Query for insert into UserAccount
    let sqlStringInsert1 = `INSERT INTO UserAccount (account, name, password, transPwd, role, otpKey, phoneNumber, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`;
    let values = [account, name, password, transPwd, 'store', otpKey, phoneNumber, email];
    sqlStringInsert1 = mysql.format(sqlStringInsert1, values);

    // Query for insert into HeadAgentInfo
    let sqlStringInsert2 = `INSERT INTO StoreInfo (
                                uid, adminId, currencyName, cash, credit, comment, inflow, outflow, exchangeRate) 
                            VALUES ((SELECT id FROM UserAccount WHERE account=?), ?, ?, ?, ?, ?, ?, ?, ?) 
                            ;`;
    values = [account, admin.id, currencyName, cash, credit, comment, inflow, outflow, exchangeRate];
    sqlStringInsert2 = mysql.format(sqlStringInsert2, values);

    // Query for update AdminInfo cash
    let sqlStringUpdate = ` UPDATE AdminInfo
                            SET cash=cash-?
                            WHERE id=?
                            ;`;
    values = [cash, admin.id];
    sqlStringUpdate = mysql.format(sqlStringUpdate, values);

    // Query for transaction record
    let sqlStringRecord1 = `INSERT INTO StoreTransaction 
                            (uid, transTypeCode, amount, relatedId, relatedName, storeId, comment)
                            VALUES (
                                ?,
                                ?,
                                ?,
                                (SELECT id FROM UserAccount WHERE account=?),
                                ?,
                                (   
                                    SELECT Store.id 
                                    FROM UserAccount AS U 
                                    INNER JOIN StoreInfo AS Store 
                                        ON Store.uid=U.id 
                                    WHERE U.account=?
                                ),
                                ?
                            );`;
    values = [admin.uid, 0, cash * -1 , account, name, account, '創建人員'];
    sqlStringRecord1 = mysql.format(sqlStringRecord1, values);

    let sqlStringRecord2 = `INSERT INTO StoreTransaction 
                            (uid, transTypeCode, amount, relatedId, relatedName, storeId, comment)
                            VALUES (
                                (SELECT id FROM UserAccount WHERE account=?),
                                ?,
                                ?,
                                ?,
                                ?,
                                (   
                                    SELECT Store.id 
                                    FROM UserAccount AS U 
                                    INNER JOIN StoreInfo AS Store 
                                        ON Store.uid=U.id 
                                    WHERE U.account=?
                                ),
                                ?
                            );`;
    values = [account, 1, cash, admin.uid, admin.name, account, '創建人員'];
    sqlStringRecord2 = mysql.format(sqlStringRecord2, values);

    // No need for transaction if cash = 0
    if(cash === 0) {
        sqlStringRecord1 = ``;
        sqlStringRecord2 = ``;
    }

    // Insert new store
    // Execute transaction
    try{
        await sqlAsync.query(req.db, 'START TRANSACTION');
        await sqlAsync.query(req.db, sqlStringInsert1 + sqlStringInsert2 + sqlStringUpdate + sqlStringRecord1 + sqlStringRecord2);
        await uploadStoreAdDefaultImage(req, account);
        await uploadUserDefaultThumbnail(req, account);
    }
    catch(error) {
        await sqlAsync.query(req.db, 'ROLLBACK'); // rollback transaction if a statement produce error
        req.logger.error(`${error.message}`);
        return res.json({err: true, msg: 'Server 錯誤'});
    }
    await sqlAsync.query(req.db, 'COMMIT');  // commit transaction only if all statement has executed without error
    
    // Log 
    req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] create a new user account[${account}] role[store  ] cash[${cash}] credit[${credit}]`);

    return res.json({err: false, msg: 'success'});
};

// Datatable ajax update
let updateHandler = async function(req,res){
    
    const result = validationResult(req);
   
    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json({err: true, msg: firstError});
    }

    // Receive data array
    let updateData = req.body.data;

    // Prepare query
    // Query for update all store
    let sqlStringTmp = `UPDATE StoreInfo 
                        SET  credit=?, comment=?, inflow=?, outflow=?
                        WHERE id=?
                        ;
                        UPDATE UserAccount
                        SET name=?, phoneNumber=?, email=?
                        WHERE id=?
                        ;`;
    let sqlStringUpdate = '';
    
    for(let i=0 ; i<updateData.length ; i++) {

        let element = updateData[i];
        let tmp = `SELECT uid FROM StoreInfo WHERE id=?;`;
        let sqlString = mysql.format(tmp, element.id);
        let result;
        try {
            result = await sqlAsync.query(req.db, sqlString);
        }
        catch(error) {
            req.logger.error(`${error.message}`);
            return res.json({err: true, msg: 'Server 錯誤'});
        }
        let values = [  
            element.credit, element.comment, element.inflow, element.outflow, element.id, element.name, element.phoneNumber, element.email, result[0].uid
        ];

        sqlStringUpdate  += mysql.format(sqlStringTmp, values);
    }

    // Execute all queries
    try{
        await sqlAsync.query(req.db, 'START TRANSACTION');
        await sqlAsync.query(req.db, sqlStringUpdate);
    }
    catch(error) {
        await sqlAsync.query(req.db, 'ROLLBACK'); // rollback transaction if a statement produce error
        req.logger.error(`${error.message}`);
        return res.json({err: true, msg: 'Server 錯誤'});
    }
    await sqlAsync.query(req.db, 'COMMIT');  // commit transaction only if all statement has executed without error
    
    // Log 
    for(let i=0 ; i<updateData.length ; i++) {
        req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] update user roleId[${updateData[i].id}] role[store] credit[${updateData[i].credit}]`);
    }

    return res.json({err: false, msg: 'success'});
};

// Datatable ajax delete
let deleteHandler = async function(req,res){

    const result = validationResult(req);

    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json({err: true, msg: firstError});
    }

    let deleteData = req.body.data;

    // Get the admin of this user
    let admin;
    try{
        admin = await getAdmin(req);
    }
    catch(error) {
        req.logger.error(`${error.message}`);
        return res.json({err: true, msg: 'Server 錯誤'});
    }


    // Prepare query, get total cash of all the store that pepare to be deleted
    let sqlStringCash =`SELECT SUM(cash) AS totalCash
                        FROM StoreInfo
                        WHERE id IN(?)
                        `;
    let values = [ deleteData.map((store) => store.id) ]; // bind a list of store id to the sql string
    sqlStringCash = mysql.format(sqlStringCash, values);

    // Get total cash of all the store that pepare to be deleted
    // Execute query
    let totalCash;
    try {
        let results = await sqlAsync.query(req.db, sqlStringCash);

        // Check result
        if(results.length <= 0 ) throw Error(`cannot calculate SUM of all stores' cash`);
        totalCash = results[0].totalCash;
    }
    catch(error) {
        req.logger.error(`${error.message}`);
        return res.json({err: true, msg: 'Server 錯誤'});
    }

    // Now, delete all stores
    // Prepare query, return cash to admin?
    let sqlStringDel = `DELETE Usr 
                        FROM UserAccount AS Usr
                        WHERE Usr.id IN (   SELECT Store.uid 
                                            FROM StoreInfo AS Store
                                            WHERE Store.id in (?) )
                        ;`;
    values = [ deleteData.map((store) => store.id) ]; // bind a list of store id to the sql string
    sqlStringDel = mysql.format(sqlStringDel, values);

    let sqlStringUpdate = `UPDATE AdminInfo
                            SET cash=cash+?
                            WHERE id=?
                            ;`;
    values = [totalCash, admin.id];
    sqlStringUpdate = mysql.format(sqlStringUpdate, values);

    // Query for transaction record
    let sqlStringRecord1 = `INSERT INTO StoreTransaction 
                            (uid, transTypeCode, amount, relatedName, comment)
                            VALUES (?, ?, ?, ?, ?);`;
    values = [admin.uid, 1, totalCash , 'N/A', '刪除人員'];
    sqlStringRecord1 = mysql.format(sqlStringRecord1, values);

    // No need for transaction if cash = 0
    if(totalCash === 0) {
        sqlStringRecord1 = ``;
    }

    // Execute all queries
    try{
        await sqlAsync.query(req.db, 'START TRANSACTION');
        await sqlAsync.query(req.db, sqlStringDel +  sqlStringUpdate + sqlStringRecord1);
    }
    catch(error) {
        await sqlAsync.query(req.db, 'ROLLBACK'); // rollback transaction if a statement produce error
        req.logger.error(`${error.message}`);
        return res.json({err: true, msg: 'Server 錯誤'});
    }
    await sqlAsync.query(req.db, 'COMMIT');  // commit transaction only if all statement has executed without error
    
    // Log 
    for(let i=0 ; i<deleteData.length ; i++) {
        req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] delete user roleId[${deleteData[i].id}] role[store]`);
    }
    req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] receive cash[${totalCash}] through deleting users`);

    return res.json({err: false, msg: 'success'});
};


// Form data validate generators
// Invoke it to produce a middleware for validating
function createValidator(){
    return [
        // Check format
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each value
        body('name')
            .isLength({ min:1 }).withMessage('名稱不可爲空')
            .isLength({ max:20 }).withMessage('名稱長度不可超過 20'),
        body('account')
            .isLength({ min:1 }).withMessage('帳號不可爲空')
            .isLength({ max:20 }).withMessage('帳號長度不可超過 20')
            .isAlphanumeric().withMessage('帳號只能含有數字或英文字母'),
        body('password')
            .isLength({ min:8 }).withMessage('密碼長度至少為8')
            .isLength({ max:20 }).withMessage('密碼長度不可超過 20')
            .isAlphanumeric().withMessage('密碼只能含有數字或英文字母'),
        body('passwordConfirm')
            .custom( function(data, {req}) { return data === req.body.password; }).withMessage('確認密碼與密碼不相同'),
        body('transPwd')
            .isLength({ min:6 }).withMessage('交易密碼需為六位數')
            .isLength({ max:6 }).withMessage('交易密碼需為六位數')
            .isInt().withMessage('交易密碼只能含有數字'),
        body('transPwdConfirm')
            .custom( function(data, {req}) { return data === req.body.transPwd; }).withMessage('確認交易密碼與交易密碼不相同'),
        body('currencyName')
            .isLength({ min:1 }).withMessage('貨幣名稱不可爲空')
            .isLength({ max:5 }).withMessage('貨幣名稱長度不可超過 5'),
        body('email')
            .isLength({ min:0, max:40 }).withMessage('信箱長度不可超過 40')
            .optional({ checkFalsy:true }) // Use optional for isInt, this allows input to be "", 0, null and false, however we check whether it is string above, so it is fine
            .isEmail({ min:0 }).withMessage('信箱格式錯誤'), 
        body('cash')
            .isNumeric({ min: 0, max: 999999999999999}).withMessage('寶石額度必須介於 0 ～ 999999999999999 之間'),
        body('credit')
            .isNumeric({ min: -999999999999999, max: 999999999999999}).withMessage('信用額度必須是數字'),
        body('phoneNumber')
            .optional({
                checkFalsy: true
            }) // Use optional for isInt, this allows input to be "", 0, null and false, however we check whether it is string above, so it is fine
            .matches(/((?=(09))[0-9]{10})$/, 'g').withMessage('請輸入10位數電話號碼'),
        body('comment')
            .isLength({ min:0, max:40 }).withMessage('備註長度不可超過 40'),
        body('inflow')
            .isInt({ min:0, max:1 }).withMessage('流入只能是0或1'),
        body('outflow')
            .isInt({ min:0, max:1 }).withMessage('流出只能是0或1'),
        body('exchangeRate')
            .isNumeric({ min: 0.01, max: 1000}).withMessage('轉換率必須介於 0.01 ～ 1000 之間'),
        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end
        
        // Check duplicate account in database
        body('account').custom(async function(data, {req}){

            // Prepare query
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
        body('currencyName').custom(async function(data, {req}){

            // Prepare query
            let sqlString =`SELECT * 
                            FROM StoreInfo 
                            WHERE currencyName=?`;
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

            if(results.length > 0) throw Error('貨幣名稱重複');

            return true;
        }),
    ];
}

function updateValidator(){
    return [
        // Check format
        // Data must be array
        body('data')
            .isArray().withMessage('Wrong data format')
            .custom( function(data) { return data.length < 10000;  }).withMessage('更改資料數量過多'),

        // All values must be string
        body('data.*.*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('data.*.id')
            .isInt({ min:0, max:9999999999 }).withMessage('Wrong data format'),
        body('data.*.name')
            .isLength({ min:1 }).withMessage('名稱不可爲空')
            .isLength({ max:20 }).withMessage('名稱長度不可超過 20'),  
        
        body('data.*.credit')
            .isNumeric({ min: -999999999999999, max: 999999999999999}).withMessage('信用額度必須是數字'),
        body('data.*.phoneNumber')
            .optional({
                checkFalsy: true
            }) // Use optional for isInt, this allows input to be "", 0, null and false, however we check whether it is string above, so it is fine
            .matches(/((?=(09))[0-9]{10})$/, 'g').withMessage('請輸入10位數電話號碼'),
        body('data.*.comment')
            .isLength({ min:0, max:40 }).withMessage('備註長度不可超過 40'),
        body('data.*.inflow')
            .isInt({ min:0, max:1 }).withMessage('流入只能是0或1'),
        body('data.*.outflow')
            .isInt({ min:0, max:1 }).withMessage('流出只能是0或1'),
        
        // Sanitize all values 
        sanitizeBody('data.*.*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end
        
        // Check permission from database
        body('data.*.id').custom(async function(data, {req}){

            // Prepare query
            // Based on different of this user, we will use different query string
            let sqlString, values;

            sqlString =`SELECT Store.id
                        FROM StoreInfo AS Store
                        `;

            if(req.user.role === 'admin'){
                sqlString += `WHERE Store.adminId=? AND Store.id=?`;
            }
            else{
                // Invalid role
                throw Error('更新無效');
            }
            values = [req.user.roleId, data];
            sqlString = mysql.format(sqlString, values);

            // Check if this store is valid for this user to update
            let results;
            try {
                results = await sqlAsync.query(req.db, sqlString);
            }
            catch(error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }

            if(results.length <= 0) throw Error('更新無效');

            return true;
        }),
    ];
}

function deleteValidator(){
    return [
        // Check format
        // Data must be array
        body('data')
            .isArray().withMessage('Wrong data format')
            .custom( function(data) { return data.length < 10000;  }).withMessage('更改資料數量過多'),

        // All values must be string
        body('data.*.*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('data.*.id')
            .isInt({ min:0, max:9999999999 }).withMessage('Wrong data format'),
        
    

        // Sanitize all values 
        sanitizeBody('data.*.*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 


        // Check permission from database
        body('data.*.id').custom(async function(data, {req}){

            // Prepare query
            // Based on different of this user, we will use different query string
            let sqlString, values;

            sqlString =`SELECT Store.id
                        FROM StoreInfo AS Store
                        `;

            if(req.user.role === 'admin'){
                sqlString += `WHERE Store.adminId=? AND Store.id=?`;
            }
            else{
                // Invalid role
                throw Error('更新無效');
            }
            values = [req.user.roleId, data];
            sqlString = mysql.format(sqlString, values);

            // Check if this store is valid for this user to delete
            let results;
            try {
                results = await sqlAsync.query(req.db, sqlString);
            }
            catch(error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }

            if(results.length <= 0) throw Error('刪除無效');

            return true;
        }),
    ];
}

// Function for get the admin of this user
// It returns admin instance in db
// Please execute it in try catch 
async function getAdmin(req){
    // Prepare query
    // Based on different of this user, we will use different query string
    let sqlStringCheck, values;

    sqlStringCheck = `SELECT Adm.*, U.name
                     FROM AdminInfo AS Adm
                     INNER JOIN UserAccount AS U
                        ON U.id=Adm.uid
                     `;

    if(req.user.role === 'admin'){
        sqlStringCheck += `WHERE Adm.id=?`;
    }
    else{
        throw Error(`invalid role`);
    }
    values = [req.user.roleId];
    sqlStringCheck = mysql.format(sqlStringCheck, values);

    // Get availBalance and id of this admin
    // Execute query
    let results = await sqlAsync.query(req.db, sqlStringCheck);

    // Check result
    if(results.length <= 0 ) throw Error(`cannot find the admin of this user account[${req.user.account}] role[${req.user.role}]`);

    return results[0];
}

module.exports = {
    render : renderHandler,
    
    read : readHandler,

    create : createHandler,
    createValidate : createValidator(),

    update : updateHandler,
    updateValidate : updateValidator(),

    delete : deleteHandler,
    deleteValidate:  deleteValidator(),
};