const
    mysql = require('mysql'),
    sqlAsync = require('../../../libs/sqlAsync'),
    { body, validationResult } = require('express-validator/check'),
    { sanitizeBody } = require('express-validator/filter');

// Page rendering
let renderHandler = async function (req, res) {
    try {
        return res.render('home/personnel/verify', { layout: 'home' });
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.render('home/personnel/verify', { layout: 'home' });
    }
};

// Datatable rendering
let readHandler = async function(req, res) {
    let data = {
        data : []
    };

    try {
        let storeName = await getStoreInfo(req);
        let agentNameList = await getAgentInfo(req);
        if (req.user.role === 'store') {
            let sql = `SELECT U.account, U.name, Br.id, Br.uid, Br.agentId, Br.createtime
                        FROM BindRequest AS Br
                        INNER JOIN AgentInfo AS Ag
                            ON Br.agentId=Ag.id
                        INNER JOIN StoreInfo AS Store
                            ON Store.id=Ag.storeId
                        INNER JOIN UserAccount AS U
                            ON U.id=Br.uid
                        WHERE Store.id=?;`;
            let values = [req.user.roleId];
            let sqlString = mysql.format(sql, values);
            try {
                let result = await sqlAsync.query(req.db, sqlString);

                data.data = result.map( (row) => {
                    let obj = {};
                    obj.id = row.id;
                    obj.account = row.account;
                    obj.name = row.name;
                    obj.storeName = storeName;
                    obj.agentName = '';
                    obj.createtime = row.createtime;

                    for( let j=0; j<agentNameList.length; j++){
                        if(agentNameList[j].id === row.agentId) {
                            obj.agentName = agentNameList[j].name;
                            break;
                        }
                    }
                    return obj;
                });
                return res.json(data);
            } catch(error) {
                req.logger.error(`${error.message}`);
                return res.json(data);
            }
        }
        return res.json(data);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json(data);
    }
};

let acceptHandler = async function(req, res) {
    
    const validateResult = validationResult(req);
    // If the form data is invalid
    if (!validateResult.isEmpty()) {
        // Return the first error to client
        let firstError = validateResult.array()[0].msg;
        return res.json({errCode: 1, msg: firstError, data: []});
    }

    let sqlString, values, sql, result;
    // Prepare query
    // Select BindRequest data
    sqlString = `SELECT uid, agentId FROM BindRequest WHERE id=?;`;
    values = [req.body.id];
    sql = mysql.format(sqlString, values);

    try {
        result = await sqlAsync.query(req.db, sql);
    } catch(error) {
        req.logger.error(`${error.message}`);
        return res.json({errCode: 1, msg: 'Server 錯誤', data: []});
    };

    const {uid, agentId} = result[0];
    // Insert MemberInfo & Delete BindRequest
    sqlString = `INSERT MemberInfo (
                    uid, agentId, cash, credit, comment)
                    VALUES (?, ?, 0, 0, '')
                ;
                DELETE Br FROM BindRequest AS Br
                WHERE Br.id=?
                ;`;
    values = [uid, agentId, req.body.id];
    sql = mysql.format(sqlString, values);
    try {
        await sqlAsync.query(req.db, 'START TRANSACTION');
        await sqlAsync.query(req.db, sql);
        await sqlAsync.query(req.db, 'COMMIT');
    } catch(error) {
        await sqlAsync.query(req.db, 'ROLLBACK');
        req.logger.error(`${error.message}`);
        return res.json({errCode: 1, msg: 'Server 錯誤', data: []});
    };

    return res.json({errCode: 0, msg: '審核成功', data: []});
};

let denyHandler = async function(req, res) {
    const validateResult = validationResult(req);
    // If the form data is invalid
    if (!validateResult.isEmpty()) {
        // Return the first error to client
        let firstError = validateResult.array()[0].msg;
        return res.json({errCode: 1, msg: firstError, data: []});
    }

    let sqlString, value, sql, result;
    // Delete BindRequest
    sqlString = `DELETE Br FROM BindRequest AS Br
                WHERE Br.id=?
                ;`;
    values = [req.body.id];
    sql = mysql.format(sqlString, values);
    try {
        await sqlAsync.query(req.db, 'START TRANSACTION');
        await sqlAsync.query(req.db, sql);
        await sqlAsync.query(req.db, 'COMMIT');
    } catch(error) {
        await sqlAsync.query(req.db, 'ROLLBACK');
        req.logger.error(`${error.message}`);
        return res.json({errCode: 1, msg: 'Server 錯誤', data: []});
    };

    return res.json({errCode: 0, msg: '拒絕成功', data: []});
    
};

function verifyValidator() {
    return [

        // For each in data array
        body('id')
            .isInt({ min:0, max:9999999999 }).withMessage('Wrong data format'),
        // Sanitize all values 
        sanitizeBody('id')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 


        // Check permission from database
        body('id').custom(async function(data, {req}){

            // Prepare query
            // Check if BindRequest id is valid
            let sqlString, values, sql, result;
            if(req.user.role === 'store'){
                sqlString = `SELECT Br.id FROM BindRequest AS Br
                            INNER JOIN AgentInfo AS Ag
                                ON Br.agentId=Ag.id
                            INNER JOIN StoreInfo AS Store
                                ON Store.id=Ag.storeId
                            WHERE Store.id=? AND Br.id=?
                            ;`
                values = [req.user.roleId, data];
                sql = mysql.format(sqlString, values);
                result = await sqlAsync.query(req.db, sql);
                if(result.length == 0) {
                    return false;
                }
            } else {
                return false;
            }

            return true;
        }),
    ];
}

let getStoreInfo = async function(req) {
    if (req.user.role === 'store') {
        let sql = `SELECT U.name
                    FROM StoreInfo AS Store
                    INNER JOIN UserAccount AS U
                        ON Store.uid=U.id
                    WHERE Store.id=?
                    ;`;
        let values = [req.user.roleId];
        let sqlString = mysql.format(sql, values);
        try {
            let result = await sqlAsync.query(req.db, sqlString);
            if (result.length == 0) {
                return null;
            } else {
                return result[0].name;
            }
        } catch (error) {
            req.logger.error(`${error.message}`);
            return null;
        }
    } else {
        throw Error('invalid role');
    }
}

let getAgentInfo = async function(req) {
    if (req.user.role === 'store') {
        let sql = `SELECT U.name, Ag.id
                FROM StoreInfo AS Store
                INNER JOIN AgentInfo AS Ag
                    ON Store.id=Ag.storeId
                INNER JOIN UserAccount AS U
                    ON Ag.uid=U.id
                WHERE Store.id=?;`;
        let values = [req.user.roleId];
        let sqlString = mysql.format(sql, values);
        try {
            let result = await sqlAsync.query(req.db, sqlString);
            if (result.length == 0) {
                return null;
            } else {
                return result;
            }
        } catch (error) {
            req.logger.error(`${error.message}`);
            return null;
        }
    } else {
        throw Error('invalid role');
    }
}

module.exports = {
    render: renderHandler,
    read: readHandler,
    accept: acceptHandler,
    deny: denyHandler,
    verifyValidate: verifyValidator(),
};