const {
        body,
        validationResult
    } = require('express-validator/check'), {
        sanitizeBody
    } = require('express-validator/filter'),
    mysql = require('mysql'),
    sqlAsync = require('../../../libs/sqlAsync');


let renderHandler = async function (req, res) {

    let useraccountresult, storeresult;
    let sqlString, values;
    
    sqlString = `SELECT *
                     FROM UserAccount
                     WHERE id = ?;`;
    values = [req.user.id];
    sqlString = mysql.format(sqlString, values);

    try {
        useraccountresult = await sqlAsync.query(req.db, sqlString);
    } catch (error) {
        req.logger.error(`${error.message}`);
        res.render('home/account/misc', {
            layout: 'home'
        });
        return;
    }

    if (useraccountresult.length <= 0) {
        req.logger.error(`connot find userAccount info of this user account[${req.user.account}] role[${req.user.role}]`);
        res.render('home/account/misc', {
            layout: 'home'
        });
        return;
    }

    if(req.user.role === 'store'){
        sqlString = `SELECT address, phoneNumber, businesshours FROM StoreInfo WHERE id = ?;`;
        values = [req.user.roleId];
        sqlString = mysql.format(sqlString, values);
        try {
            storeresult = await sqlAsync.query(req.db, sqlString);
        } catch (error) {
            req.logger.error(`${error.message}`);
            res.render('home/account/misc', {
                layout: 'home'
            });
            return;
        }

        res.locals.Info = {
            name: useraccountresult[0]['name'],
            email: useraccountresult[0]['email'],
            phoneNumber: storeresult[0]['phoneNumber'],
            address: storeresult[0]['address'],
            businesshours: storeresult[0]['businesshours'],
        };

    } else {
        res.locals.Info = {
            name: useraccountresult[0]['name'],
            email: useraccountresult[0]['email'],
            phoneNumber: useraccountresult[0]['phoneNumber'],
        };
    }

    //console.log(res.locals.Info);
    res.render('home/account/misc', {
        layout: 'home'
    });
};

let misceditHandler = async function (req, res) {

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

    let query = req.query.tab;
    let updateQuery = '';

    // do action according to query
    if (query === 'account') {
        let values;
        let updateQuery1 = `UPDATE UserAccount
                        SET name = ?,
                            email = ?,
                            phoneNumber = ?
                        WHERE id = ?;`;
        values = [req.body.name, req.body.email, req.body.phoneNumber, req.user.id];
        updateQuery = mysql.format(updateQuery1, values);

        if(req.user.role === 'store'){
            let updateQuery2 = `UPDATE StoreInfo
                                SET address = ?,
                                    phoneNumber = ?,
                                    businesshours = ?
                                WHERE id = ?;`;
            values = [req.body.address, req.body.phoneNumber, req.body.businesshours, req.user.roleId];
            updateQuery = updateQuery + mysql.format(updateQuery2, values);
        }

    } else if (query === 'pwd') {
        let checkQuery = `SELECT *
                      FROM UserAccount
                      WHERE id = ?`;
        let values = [req.user.id];
        checkQuery = mysql.format(checkQuery, values);
        let checkresult;
        try {
            checkresult = await sqlAsync.query(req.db, checkQuery);
        } catch (error) {
            req.logger.error(`${error.message}`);
            return res.json({
                err: true,
                msg: '修改失敗'
            });
        }
        if (req.body.oldpassword !== checkresult[0]['password']) {
            // password not correct
            req.logger.error(`account[${req.user.account}] role[${req.user.role}] change password failed -> oldpassword not correct`);
            return res.json({
                err: true,
                msg: '密碼錯誤'
            });
        } else {
            updateQuery = `UPDATE UserAccount
                         SET password=?
                         WHERE id=?;`;
            let values = [req.body.newpassword, req.user.id];
            updateQuery = mysql.format(updateQuery, values);
        }
    } else if (query === 'transPwd') {
        let checkQuery = `SELECT *
                      FROM UserAccount
                      WHERE id = ?`;
        let values = [req.user.id];
        checkQuery = mysql.format(checkQuery, values);
        let checkresult;
        try {
            checkresult = await sqlAsync.query(req.db, checkQuery);
        } catch (error) {
            req.logger.error(`${error.message}`);
            return res.json({
                err: true,
                msg: '修改失敗'
            });
        }
        if (req.body.oldTransPwd !== checkresult[0]['transPwd']) {
            // password not correct
            req.logger.error(`account[${req.user.account}] role[${req.user.role}] change transPwd failed -> oldTransPwd not correct`);
            return res.json({
                err: true,
                msg: '交易密碼錯誤'
            });
        } else {
            updateQuery = `UPDATE UserAccount
                         SET transPwd=?
                         WHERE id=?;`;
            let values = [req.body.newTransPwd, req.user.id];
            updateQuery = mysql.format(updateQuery, values);
        }
    } else if (query === 'img') {
        let checkQuery = `SELECT *
                      FROM UserAccount
                      WHERE id = ?`;
        let values = [req.user.id];

        checkQuery = mysql.format(checkQuery, values);
        let checkresult;
        try {
            checkresult = await sqlAsync.query(req.db, checkQuery);
        } catch (error) {
            req.logger.error(`${error.message}`);
            return res.json({
                err: true,
                msg: '修改失敗'
            });
        }
        if(req.files['userImg'] != undefined){

            updateQuery = `UPDATE UserAccount
                         SET imageSrc=?, imageKey=?
                         WHERE id=?;`;
            let values = [req.files['userImg'][0].location, req.files['userImg'][0].key, req.user.id];
            updateQuery = mysql.format(updateQuery, values);
            if(checkresult[0].imageKey.length > 0){
                let params = {
                    Bucket: process.env.S3_BUCKET,
                    Delete: { // required
                        Objects: [ // required
                            {
                                Key: checkresult[0].imageKey // required
                            },
                        ],
                    },
                };
                
                req.s3.deleteObjects(params, function (err, data) {
                    if (err) console.log(err, err.stack); // an error occurred
                    else console.log(data); // successful response
                });
            }
        }
        if(req.files['roleImg'] != undefined){
            if(req.user.role === 'store'){
                let checkQuery = `SELECT *
                      FROM StoreInfo
                      WHERE id = ?
                      ;`;
                let values = [req.user.roleId];
                checkQuery = mysql.format(checkQuery, values);
                checkresult = await sqlAsync.query(req.db, checkQuery);
                if(checkresult[0].imageKey.length > 0){
                    let params = {
                        Bucket: process.env.S3_BUCKET,
                        Delete: { // required
                            Objects: [ // required
                                {
                                    Key: checkresult[0].imageKey // required
                                },
                            ],
                        },
                    };
                    
                    req.s3.deleteObjects(params, function (err, data) {
                        if (err) console.log(err, err.stack); // an error occurred
                        else console.log(data); // successful response
                    });
                }

                let sql = `UPDATE StoreInfo
                         SET imageSrc=?, imageKey=?
                         WHERE id=?;`;
                values = [req.files['roleImg'][0].location, req.files['roleImg'][0].key, req.user.roleId];
                updateQuery = updateQuery + mysql.format(sql, values);
                
            }
        }
        if(req.files['currencyImg'] != undefined){

            if(req.user.role === 'store'){
                let checkQuery = `SELECT *
                      FROM StoreInfo
                      WHERE id = ?
                      ;`;
                let values = [req.user.roleId];
                checkQuery = mysql.format(checkQuery, values);
                checkresult = await sqlAsync.query(req.db, checkQuery);
                if(checkresult[0].currencyKey.length > 0){
                    let params = {
                        Bucket: process.env.S3_BUCKET,
                        Delete: { // required
                            Objects: [ // required
                                {
                                    Key: checkresult[0].currencyKey // required
                                },
                            ],
                        },
                    };
                    
                    req.s3.deleteObjects(params, function (err, data) {
                        if (err) console.log(err, err.stack); // an error occurred
                        else console.log(data); // successful response
                    });
                }

                let sql = `UPDATE StoreInfo
                         SET currencySrc=?, currencyKey=?
                         WHERE id=?;`;
                values = [req.files['currencyImg'][0].location, req.files['currencyImg'][0].key, req.user.roleId];
                updateQuery = updateQuery + mysql.format(sql, values);
                
            }
        }
    }else {
        req.logger.error(`cannot find the query[${req.query}] while edit mis, req from account[${req.user.account}] role[${req.user.role}]`);
        return res.json({
            err: true,
            msg: 'Server 錯誤'
        });
    }
    try {   
        await sqlAsync.query(req.db, updateQuery);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({
            err: true,
            msg: '修改失敗'
        });
    }
    req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] edit the misc info of account[${req.user.account}] role[${req.user.role}]`);
    return res.json({
        err: false,
        msg: '修改成功'
    });
};


function editValidator() {
    return [
        body('*')
            .custom(function (data, {
                req
            }) {
                if (req.query.tab === 'account') {
                    if (req.body.name.length <= 0) {
                        throw Error('名稱不可爲空');
                    }
                    if (req.body.name.length > 20) {
                        throw Error('名稱長度不可超過 20');
                    }
                } else if (req.query.tab === 'pwd') {
                    // if (req.body.oldpassword.length < 8) {
                    //     throw Error('密碼長度至少為8');
                    // }
                    // if (req.body.oldpassword.lenght > 20) {
                    //     throw Error('密碼長度不可超過 20');
                    // }
                    if (!req.body.oldpassword.match(/^[0-9a-z]+$/i)) {
                        throw Error('密碼只能含有數字或英文字母');
                    }
                    if (req.body.newpassword.length < 8) {
                        throw Error('密碼長度至少為8');
                    }
                    if (req.body.newpassword.length > 20) {
                        throw Error('密碼長度不可超過 20');
                    }
                    if (!req.body.newpassword.match(/^[0-9a-z]+$/i)) {
                        throw Error('密碼只能含有數字或英文字母');
                    }
                    if (req.body.newpassword !== req.body.confirmpassword) {
                        throw Error('確認密碼與密碼不相同');
                    }
                } else if (req.query.tab === 'transPwd') {
                    // if (req.body.oldTransPwd.length != 6) {
                    //     throw Error('交易密碼需為六位數');
                    // }
                    // if (!req.body.oldTransPwd.match(/^[0-9]+$/)) {
                    //     throw Error('交易密碼只能含有數字');
                    // }
                    if (req.body.newTransPwd.length != 6) {
                        throw Error('交易密碼不可爲空');
                    }
                    if (!req.body.newTransPwd.match(/^[0-9]+$/)) {
                        throw Error('交易密碼只能含有數字');
                    }
                    if (req.body.newTransPwd !== req.body.confirmTransPwd) {
                        throw Error('確認交易密碼與交易密碼不相同');
                    }
                }
                return true;
            }),
        body('name')
            .isLength({
                min: 0,
                max: 10
            }).withMessage('名稱長度不可超過 10'),
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
            }), // Use optional for isInt, this allows input to be "", 0, null and false, however we check whether it is string above, so it is fine
            // .matches(/((?=(09))[0-9]{10})$/, 'g').withMessage('請輸入10位數電話號碼'),
        body('businesshours')
            .isLength({
                max: 50
            }).withMessage('營業時間長度不可超過 50'),
        body('address')
            .isLength({
                max: 50
            }).withMessage('地址長度不可超過 50'),
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(),

    ];
}

module.exports = {
    render: renderHandler,
    edit: misceditHandler,
    editValidate: editValidator()
};