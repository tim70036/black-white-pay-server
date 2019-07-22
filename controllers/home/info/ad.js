const
    mysql = require('mysql'),
    sqlAsync = require('../../../libs/sqlAsync'),
    {
        body,
        validationResult
    } = require('express-validator/check'),
    {
        sanitizeBody
    } = require('express-validator/filter');


// Page rendering
let renderHandler = function (req, res) {
    res.render('home/info/ad', {
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
    let sqlString = `SELECT id, title, updatetime,  createtime
                     FROM Ad
                     WHERE storeId=?
                    ;`;
    let values = [req.user.roleId];
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
    try {
        if (!result.isEmpty()) {
            // delete s3 photo
            if (req.files['adImg'] != undefined) {
                let params = {
                    Bucket: process.env.S3_BUCKET,
                    Delete: { // required
                        Objects: [ // required
                            {
                                Key: req.files['adImg'][0].key // required
                            },
                        ],
                    },
                };
                req.s3.deleteObjects(params, function (err, data) {
                    if (err) console.log(err, err.stack); // an error occurred
                    else console.log(data); // successful response
                });
            } 
            // Return the first error to client
            let firstError = result.array()[0].msg;
            return res.json({
                err: true,
                msg: firstError
            });
        }
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({err: true, msg: 'Server 錯誤'});
    }
    

    const 
        {
            title
        } = req.body;
    let storeId = req.user.roleId;

    let sql, values, sqlString, results;

    try {

        if (req.files['adImg'] != undefined) {
            
            sql = `INSERT INTO Ad (storeId, title, imageSrc, imageKey) VALUES (?, ?, ?, ?);`;
            values = [storeId, title, req.files['adImg'][0].location, req.files['adImg'][0].key];
            sqlString = mysql.format(sql, values);
            await sqlAsync.query(req.db, sqlString);

        } else{
            return res.json({err: true, msg: '未上傳圖片'});
        }
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({err: true, msg: 'Server 錯誤'});
    }

    // Log 
    req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] create a new ad title[${title}]`);

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

    let sql, values, sqlString, sqlStringDel = '';
    let deleteData = req.body.data;

    for(let i = 0; i < deleteData.length; i++){
        sql = `SELECT imageKey FROM Ad WHERE id=?;`;
        values = [deleteData[i].id];
        sqlString = mysql.format(sql, values);
        let results = await sqlAsync.query(req.db, sqlString);
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
        sql = `DELETE FROM Ad WHERE id=?;`;
        values = [deleteData[i].id]; // bind a list of ad id to the sql string
        sqlStringDel = sqlStringDel + mysql.format(sql, values);
    }

    // Execute all queries
    try {
        await sqlAsync.query(req.db, 'START TRANSACTION');
        await sqlAsync.query(req.db, sqlStringDel);
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
    for (let i = 0; i < deleteData.length; i++) {
        req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] delete ad id[${deleteData[i].id}]`);
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
        body('title')
            .isLength({
                min: 1
            }).withMessage('標題不可爲空')
            .isLength({
                max: 40
            }).withMessage('標題長度不可超過 40'),
        // Sanitize values 
        sanitizeBody('title')
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
                             FROM Ad 
                             WHERE storeId=? AND id=?`;

            let values = [req.user.roleId, data];
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