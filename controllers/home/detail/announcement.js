const
    mysql = require('mysql'),
    sqlAsync = require('../../../libs/sqlAsync'),
    { body, query, validationResult } = require('express-validator/check'),
    { sanitizeBody, sanitizeQuery } = require('express-validator/filter');


// Page rendering
let renderHandler = async function(req,res){

    const result = validationResult(req);

    // If the query data is invalid
    if (!result.isEmpty()) {
        // Redirect to home page if invalid
        let firstError = result.array()[0].msg;
        return res.redirect(303, '/');
    }

    // Gather all required data
    let 
        { id } = req.query;

    // Prepare query
    let sqlString =`SELECT id, title, imageSrc
                    FROM Announcement
                    WHERE id=? AND adminId=?
                    ;`; 
    let values = [id, req.user.roleId];
    sqlString = mysql.format(sqlString, values);

    // Get and return annonucement 
    try {
        let results = await sqlAsync.query(req.db, sqlString);

        if(results.length <= 0) throw Error(`cannot find announcement id[${id}] of user role[${req.user.role}] roleId[${req.user.roleId}]`);

        return res.render('home/detail/announcement', {layout : 'home', announcement: results[0]});

    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.redirect(303, '/');
    }
};

let editHandler = async function(req,res){

    const result = validationResult(req);

    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json({err: true, msg: firstError});
    }

    // Gather all required data
    const 
        {   id,
            title
        } = req.body;


    let sql, values, sqlString, results;

    try {

        if (req.files['announcementImg'] != undefined) {

            sql = `SELECT imageKey FROM Announcement WHERE id=?`;
            values = [id];
            sqlString = mysql.format(sql, values);
            results = await sqlAsync.query(req.db, sqlString);
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
            
            sql = `UPDATE Announcement
                            SET title=?, imageSrc=?, imageKey=?
                            WHERE id=?
                            `;
            values = [title, req.files['announcementImg'][0].location, req.files['announcementImg'][0].key, id];
            sqlString = mysql.format(sql, values);
            await sqlAsync.query(req.db, sqlString);

        } else{
            sql = `UPDATE Announcement
                            SET title=?
                            WHERE id=?
                            `;
            values = [title, id];
            sqlString = mysql.format(sql, values);
            await sqlAsync.query(req.db, sqlString);
        }
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({err: true, msg: 'Server 錯誤'});
    }

    // Log
    req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] update annonuce id[${id}]`);

    return res.json({err: false, msg: 'success'});
};

// Form data validate generators
// Invoke it to produce a middleware for validating
function renderValidator(){
    return [
        // Check format
        // All values must be string
        query('*')
            .isString().withMessage('Wrong data format'),
        // For each value
        query('id')
            .isInt({ min:0, max:9999999999 }).withMessage('Wrong data format'),

        // Sanitize all values
        sanitizeQuery('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end

        // Check permission from database
        query('id').custom(async function(data, {req}){

            // Prepare query
            let sqlString =`SELECT id 
                            FROM Announcement
                            WHERE adminId=? AND id=?`;
            let values = [req.user.roleId, data];
            sqlString = mysql.format(sqlString, values);

            let results;
            try {
                results = await sqlAsync.query(req.db, sqlString);
            }
            catch(error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }

            if(results.length <= 0) throw Error('權限不足');

            return true;
        }),
    ];
}


function editValidator(){
    return [
        // Check format
        // All values must be string
        body('*')
           .isString().withMessage('Wrong data format'),

        // For each value
        body('id')
            .isInt({ min:0, max:9999999999 }).withMessage('Wrong data format'),
        body('title')
            .isLength({ min:1 }).withMessage('標題不可爲空')
            .isLength({ max:40 }).withMessage('標題長度不可超過 40'),
       
        // Sanitize values 
        sanitizeBody('title')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end

        // Check permission from database
        body('id').custom(async function(data, {req}){

            // Prepare query
            let sqlString = `SELECT id 
                             FROM Announcement
                             WHERE adminId=? AND id=?`;

            let values = [req.user.roleId, data];
            sqlString = mysql.format(sqlString, values);

            // Check if this annonuce is valid for this user to delete
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


module.exports = {
    render : renderHandler,
    renderValidate : renderValidator(),
    edit : editHandler,
    editValidate : editValidator(),
};