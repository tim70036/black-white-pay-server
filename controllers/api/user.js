const
    { body, validationResult } = require('express-validator/check'),
    { sanitizeBody } = require('express-validator/filter'),
    mysql = require('mysql'),
    sqlAsync = require('../../libs/sqlAsync');

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




module.exports = {

    changeName: changeNameHandler,
    changeNameValidate: changeNameValidator(),

    changePwd: changePwdHandler,
    changePwdValidate: changePwdValidator(),

    changeTransPwd: changeTransPwdHandler,
    changeTransPwdValidate: changeTransPwdValidator(),

    changeThumbnail: changeThumbnailHandler,
};