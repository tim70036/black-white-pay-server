const
    { body, validationResult } = require('express-validator/check'),
    { sanitizeBody } = require('express-validator/filter'),
    mysql = require('mysql'),
    sqlAsync = require('../../libs/sqlAsync');

    let preLoadUriListHandler = async function (req, res, next) {
        let uriList = [];
        let sqlString, values;
        // 1. get Annoucement uri
        let sqlString1 = `
                            SELECT An.imageSrc AS uri
                            FROM Announcement AS An
                            ORDER BY An.id DESC
                            LIMIT 5;
                        `;
        values = [req.user.id];
        sqlString1 = mysql.format(sqlString1, values);
    
        // 2. get Ad uri ( all store )
        let sqlString2 = `
                            SELECT Ad.imageSrc AS uri
                            From Ad
                            INNER JOIN StoreInfo AS Store
                                ON Store.id=Ad.storeId
                            INNER JOIN AgentInfo AS Ag
                                ON Ag.storeId=Store.id
                            INNER JOIN MemberInfo AS Mem
                                ON Mem.agentId=Ag.id
                            WHERE Mem.uid=?;
                        `;
        values = [req.user.id];
        sqlString2 = mysql.format(sqlString2, values);
    
        // 3. get user thumbnail uri
        let sqlString3 = `
                            SELECT imageSrc AS uri
                            FROM UserAccount
                            WHERE id=?;
                        `;
        values = [req.user.id];
        sqlString3 = mysql.format(sqlString3, values);
    
        // 4. get currency image uri
        let sqlString4 = ` 
                            SELECT currencySrc AS uri
                            FROM StoreInfo AS Store
                            INNER JOIN AgentInfo AS Ag
                                ON Ag.storeId=Store.id
                            INNER JOIN MemberInfo AS Mem
                                ON Mem.agentId=Ag.id
                            WHERE Mem.uid=?; 
                        `;
        values = [req.user.id];
        sqlString4 = mysql.format(sqlString4, values);
    
        // 5. get store image uri
        let sqlString5 = `
                            SELECT imageSrc AS uri
                            FROM StoreInfo AS Store
                            INNER JOIN AgentInfo AS Ag
                                ON Ag.storeId=Store.id
                            INNER JOIN MemberInfo AS Mem
                                ON Mem.agentId=Ag.id
                            WHERE Mem.uid=?;
                        `;
        values = [req.user.id];
        sqlString5 = mysql.format(sqlString5, values);
    
        sqlString = sqlString1 + sqlString2 + sqlString3 + sqlString4 + sqlString5;
        try {
            uriList = await sqlAsync.query(req.db, sqlString);
        } catch (error) {
            req.logger.error(`${error.message}`);
            return res.json({ errCode: 2, msg: 'Server 錯誤' });
        }
        
        // parse results foramt to array
        let results = [...uriList[0], ...uriList[1], ...uriList[2], ...uriList[3], ...uriList[4]].map( obj => obj.uri);
        // filter the empty uri
        results = results.reduce(function (arr, row) {
            if (row !== '') arr.push(row);
            return arr;
        }, []);
    
        return res.json({ errCode: 0, msg: 'success', data: results });
    };

let changeNameHandler = async function(req,res, next) {
    const result = validationResult(req);
    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json({ errCode: 1, msg: firstError });
    }

    // Gather all required data
    let { name } = req.body;

    try{
        
        let sql = `UPDATE UserAccount SET name=? WHERE id=?;`;
        let values = [name, req.user.id];
        let sqlString = mysql.format(sql, values);
        await sqlAsync.query(req.db, sqlString);
    }
    catch(error){
        req.logger.error(`${error.message}`);
        return res.json({ errCode: 2, msg: 'Server 錯誤' });
    }

    req.logger.verbose(`uid[${req.user.id}] role[member] change name[${name}]`);

    return res.json({ errCode: 0, msg: 'success' });
};

let changePwdHandler = async function(req,res, next) {
    const result = validationResult(req);
    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json({ errCode: 1, msg: firstError });
    }

    // Gather all required data
    let { newPwd } = req.body;

    try{
        
        let sql = `UPDATE UserAccount SET password=? WHERE id=?;`;
        let values = [newPwd, req.user.id];
        let sqlString = mysql.format(sql, values);
        await sqlAsync.query(req.db, sqlString);
    }
    catch(error){
        req.logger.error(`${error.message}`);
        return res.json({ errCode: 2, msg: 'Server 錯誤' });
    }

    req.logger.verbose(`uid[${req.user.id}] role[member] change password[${newPwd}]`);

    return res.json({ errCode: 0, msg: 'success' });

};

let changeTransPwdHandler = async function(req,res, next) {
    const result = validationResult(req);
    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json({ errCode: 1, msg: firstError });
    }

    // Gather all required data
    let { newPwd } = req.body;

    try{
        
        let sql = `UPDATE UserAccount SET transPwd=? WHERE id=?;`;
        let values = [newPwd, req.user.id];
        let sqlString = mysql.format(sql, values);
        await sqlAsync.query(req.db, sqlString);
    }
    catch(error){
        req.logger.error(`${error.message}`);
        return res.json({ errCode: 2, msg: 'Server 錯誤' });
    }

    req.logger.verbose(`uid[${req.user.id}] role[member] change transPassword[${newPwd}]`);

    return res.json({ errCode: 0, msg: 'success' });
};

let changeThumbnailHandler = async function(req,res, next) {

    /* const result = validationResult(req);
    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json({ errCode: 1, msg: firstError });
    } */
    try {
        let key, url;
        let sql, values, sqlString, results;

        if (req.files['userImg'] != undefined) {

            key = req.files['userImg'][0].key;
            url = req.files['userImg'][0].location;

            sql = `SELECT imageKey FROM UserAccount WHERE id=?;`;
            values = [req.user.id];
            sqlString = mysql.format(sql, values);
            results = await sqlAsync.query(req.db, sqlString);
            if(results[0].imageKey){
                let params = {
                    Bucket: process.env.S3_BUCKET,
                    Delete: { // required
                        Objects: [ // required
                            {
                                Key: results[0].imageKey // required
                            },
                        ],
                    },
                };
                
                req.s3.deleteObjects(params, function (err, data) {
                    if (err) console.log(err, err.stack); // an error occurred
                    else console.log(data); // successful response
                });
            // Prepare query
            }
            
            // Query for insert into Ad
            sql = `UPDATE UserAccount SET imageSrc=?, imageKey=? WHERE id=?;`;
            values = [url, key, req.user.id];
            sqlString = mysql.format(sql, values);
            await sqlAsync.query(req.db, sqlString);
            return res.json({ errCode: 0, msg: 'success', data: { url: url} });
        } else {
            return res.json({ errCode: 1, msg: '資料格式 錯誤' });
        }
    
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({ errCode: 2, msg: 'Server 錯誤' });
    }
};

let qrReFavListHandler = async function (req, res, next) {
    let sqlString, values, results;
    sqlString = `
                    SELECT Qr.id, Qr.storeId, Store.currencyName, Qr.amount, Qr.comment
                    FROM QrReceiveFavorite AS Qr
                    LEFT JOIN StoreInfo AS Store
                        ON Qr.storeId = Store.id
                    WHERE Qr.uid=?;
                `;
    values = [req.user.id];
    sqlString = mysql.format(sqlString, values);
    try {
        results = await sqlAsync.query(req.db, sqlString);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({ errCode: 2, msg: 'Server 錯誤' });
    }
    // add currencyName to  storeId:-1  record
    results = results.map(e => (e.currencyName === null) ? {...e, currencyName: '魂幣'} : e );
    return res.json({ errCode: 0, msg: 'success', data: results });
};

let addQrReFavHandler = async function (req, res, next) {
    const result = validationResult(req);

    // if the form data or the request is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json({ errCode: 1, msg: firstError });
    }

    // Gather data
    let {
        storeId,
        amount,
        comment,
    } = req.body;

    let sqlString1, sqlString2, values, results

    // Insert record query
    sqlString1 = `
                  INSERT INTO QrReceiveFavorite (uid, storeId, amount, comment)
                  VALUES (?, ?, ?, ?);
                `;
    values = [req.user.id, storeId, amount, comment];
    sqlString1 = mysql.format(sqlString1, values);

    // get list query
    sqlString2 = `
                    SELECT Qr.id, Qr.storeId, Store.currencyName, Qr.amount, Qr.comment
                    FROM QrReceiveFavorite AS Qr
                    LEFT JOIN StoreInfo AS Store
                        ON Qr.storeId = Store.id
                    WHERE Qr.uid=?;
                `;
    values = [req.user.id];
    sqlString2 = mysql.format(sqlString2, values);
    
    // execute query
    let sqlString = sqlString1 + sqlString2;
    try {
        results = await sqlAsync.query(req.db, sqlString);
    } catch (errpr) {
        req.logger.error(`${error.message}`);
        return res.json({ errCode: 2, msg: 'Server 錯誤' });
    }
    // add currencyName to  storeId:-1  record
    results[1] = results[1].map(e => (e.currencyName === null) ? {...e, currencyName: '聯盟幣'} : e );
    return res.json({ errCode: 0, msg: 'success', data: results[1] });
};

let deleteQrReFavHandler = async function (req, res, next) {
    const result = validationResult(req);

    // if the form data or the request is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json({ errCode: 1, msg: firstError });
    }
    // Gather data
    let id = req.body.id;
    console.log(id);

    let values, results;
    let sqlString1 = `
                        DELETE FROM QrReceiveFavorite 
                        WHERE id=?;
                    `;
    values = [id];
    sqlString1 = mysql.format(sqlString1, values);

    let sqlString2 = `
                        SELECT Qr.id, Qr.storeId, Store.currencyName, Qr.amount, Qr.comment
                        FROM QrReceiveFavorite AS Qr
                        LEFT JOIN StoreInfo AS Store
                            ON Qr.storeId = Store.id
                        WHERE Qr.uid=?;
                    `;
    values = [req.user.id];
    sqlString2 = mysql.format(sqlString2, values);

    let sqlString = sqlString1 + sqlString2;
    try {
        results = await sqlAsync.query(req.db, sqlString);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({ errCode: 2, msg: 'Server 錯誤' });
    }
    // add currencyName to  storeId:-1  record
    results[1] = results[1].map(e => (e.currencyName === null) ? {...e, currencyName: '聯盟幣'} : e );
    return res.json({ errCode: 0, msg: 'success', data: results[1] });

};

// Form data validate generators
// Invoke it to produce a middleware for validating
function changeNameValidator(){
    return [
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('name')
            .isLength({ min:1 }).withMessage('名稱不可爲空')
            .isLength({ max:20 }).withMessage('名稱長度不可超過 20'),

        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 
    ];
}

function changePwdValidator(){
    return [
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('oldPwd')
            .isLength({ min:1 }).withMessage('密碼長度至少為1')
            .isLength({ max:20 }).withMessage('密碼長度不可超過 20')
            .isAlphanumeric().withMessage('密碼只能含有數字或英文字母'),
        body('newPwd')
            .isLength({ min:8 }).withMessage('密碼長度至少為8')
            .isLength({ max:20 }).withMessage('密碼長度不可超過 20')
            .isAlphanumeric().withMessage('密碼只能含有數字或英文字母'),
        body('oldPwd').custom(async function(data, {req}){

            // Prepare query
            // Remeber to use charset utf8mb4_bin in DB
            let sqlString =`SELECT password
                            FROM UserAccount 
                            WHERE id=?`;
            let values = [req.user.id];
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
    
            if(results[0].password !== data) throw Error('密碼錯誤');
    
            return true;
        }),

        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 
    ];
}

function changeTransPwdValidator(){
    return [
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('oldPwd')
            .isLength({ min:1 }).withMessage('密碼長度至少為1')
            .isLength({ max:20 }).withMessage('密碼長度不可超過 20')
            .isInt().withMessage('交易密碼只能含有數字'),
        body('newPwd')
            .isLength({ min:6 }).withMessage('交易密碼需為六位數')
            .isLength({ max:6 }).withMessage('交易密碼需為六位數 20')
            .isInt().withMessage('交易密碼只能含有數字'),
        body('oldPwd').custom(async function(data, {req}){

            // Prepare query
            // Remeber to use charset utf8mb4_bin in DB
            let sqlString =`SELECT transPwd
                            FROM UserAccount 
                            WHERE id=?`;
            let values = [req.user.id];
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
    
            if(results[0].transPwd !== data) throw Error('密碼錯誤');
    
            return true;
        }),
        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 
    ];
}

function addQrReFavValidator() {
    return [
        // All values msut be string
        body('*')
            .isString().withMessage('Wrong data format'),

        body('storeId')
            .isLength({ min: 1 }).withMessage('storeId 不可爲空')
            .isLength({ max: 200 }).withMessage('storeId 長度不可超過 200')
            .isInt({ min: -1 }).withMessage('storeId必須是數字')
            .custom(async function(data, {req}) {
                let storeId = Number(data);
                if (storeId === -1) return true;
                let sqlString = `
                                    SELECT Mem.id
                                    FROM MemberInfo AS Mem
                                    INNER JOIN AgentInfo AS Ag
                                        ON Mem.agentId = Ag.id
                                    INNER JOIN UserAccount AS U
                                        ON U.id = Mem.uid
                                    WHERE Ag.storeId=? AND U.id=?;
                `;
                let values = [storeId, req.user.id];
                sqlString = mysql.format(sqlString, values);
                let results;
                try {
                    results = await sqlAsync.query(req.db, sqlString);
                } catch (error) {
                    req.logger.error(`${error.message}`);
                    throw Error('Server 錯誤');
                }
                if (results.length <= 0) throw Error('店家代碼錯誤');
                return true;
            }),

        body('amount')
            .isInt({ min: 1, max: 99999999999 }).withMessage('轉帳數量必須介於 1 ～ 99999999999 之間的整數'),

        body('comment')
            .isLength({ min: 0, max: 10}).withMessage('備註長度不可超過 10'),

        // Sanitize all values 
		sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 

        // check multi
        body('amount').custom(async function(data, {req}) {
            let { storeId, amount, comment } = req.body;
            let sqlString1 = `
                                SELECT id
                                FROM QrReceiveFavorite
                                WHERE uid=? AND storeId=? AND amount=? AND comment=?;
                            `;
            let values = [req.user.id, storeId, amount, comment];
            sqlString1 = mysql.format(sqlString1, values);
            let sqlString2 = `
                                SELECT COUNT(*) 
                                FROM QrReceiveFavorite
                                WHERE uid=?;
                            `;
            values = [req.user.id];
            sqlString2 = mysql.format(sqlString2, values);
            let sqlString = sqlString1 + sqlString2;
            let results;
            try {
                results = await sqlAsync.query(req.db, sqlString);
            } catch (error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }
            if (results[0].length >= 1) throw Error('常用收款已存在');
            if (results[1] >= 99) throw Error('已達常用收款個數上限');
            
            return true;
        }),
        
    ];
}

function deleteQrReFavValidator() {
    return [
        // All values msut be string
        body('*')
            .isString().withMessage('Wrong data format'),

        body('id')
            .isLength({ min: 1 }).withMessage('Id 不可爲空')
            .isInt({ min: 1 }).withMessage('Id必須是數字')
            .custom(async function(data, {req}) {
                let sqlString = `
                                    SELECT id
                                    FROM QrReceiveFavorite
                                    WHERE id=? AND uid=?;
                                `;
                let values = [data, req.user.id];
                sqlString = mysql.format(sqlString, values);
                let results;
                try {
                    results = await sqlAsync.query(req.db, sqlString);
                } catch (error) {
                    req.logger.error(`${error.message}`);
                    throw Error('Server 錯誤');
                }
                if (results.lenth <= 0) throw Error(`無此紀錄`);
                return true;
            }),

        // Sanitize all values 
		sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end


    ];
}



module.exports = {

    preloadUri: preLoadUriListHandler,

    changeName: changeNameHandler,
    changeNameValidate: changeNameValidator(),

    changePwd: changePwdHandler,
    changePwdValidate: changePwdValidator(),

    changeTransPwd: changeTransPwdHandler,
    changeTransPwdValidate: changeTransPwdValidator(),

    changeThumbnail: changeThumbnailHandler,


    qrReFavList: qrReFavListHandler,

    addQrReFav: addQrReFavHandler,
    addQrReFavValidate: addQrReFavValidator(),

    deleteQrReFav: deleteQrReFavHandler,
    deleteQrReFavValidate: deleteQrReFavValidator(),

};