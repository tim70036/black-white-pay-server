const
    { body, validationResult } = require('express-validator/check'),
    { sanitizeBody } = require('express-validator/filter'),
    mysql = require('mysql'),
    sqlAsync = require('../../libs/sqlAsync');

let listHandler = async function(req, res, next) {

    let sqlString = `
                      SELECT Store.id AS storeId, U.name AS name, Store.imageSrc AS thumbnail
                      FROM StoreInfo AS Store
                      INNER JOIN UserAccount AS U
                          ON U.id=Store.uid
                      INNER JOIN AgentInfo AS Ag
                          ON Ag.storeId=Store.id
                      INNER JOIN MemberInfo AS Mem
                          ON Mem.agentId=Ag.id
                      WHERE Mem.uid=?
                  `;
    let values = [req.user.id];
    sqlString = mysql.format(sqlString, values);

    let storeList = [];
    try {
        storeList = await sqlAsync.query(req.db, sqlString);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({ errCode : 2, msg: 'Server 錯誤' });
    }
    return res.json({ errCode : 0, msg: 'success', data: storeList });
};

let adHandler = async function(req, res, next) {
    const result = validationResult(req);
    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json({ errCode: 1, msg: firstError });
    }

    // Gather all required data
    const { storeId } = req.body;

    let sqlString = `
                      SELECT Ad.title AS title, Ad.imageSrc AS image
                      From Ad
                      INNER JOIN StoreInfo AS Store
                          ON Store.id=Ad.storeId
                      INNER JOIN AgentInfo AS Ag
                          ON Ag.storeId=Store.id
                      INNER JOIN MemberInfo AS Mem
                          ON Mem.agentId=Ag.id
                      WHERE Mem.uid=? AND Store.id=?
                  `;
    let values = [req.user.id, storeId];
    sqlString = mysql.format(sqlString, values);

    let adList = [];
    try {
        adList = await sqlAsync.query(req.db, sqlString);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({ errCode : 2, msg: 'Server 錯誤' });
    }
    return res.json({ errCode : 0, msg: 'success', data: adList });
};

let bindHandler = async function(req, res, next){
    const result = validationResult(req);
    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json({ errCode: 1, msg: firstError });
    }

    // Gather all required data
    const { bindCode } = req.body;
    let sql, values, sqlString, results;
    sql = `SELECT Store.bindCheck
            From AgentInfo AS Ag
            INNER JOIN StoreInfo AS Store
                ON Ag.storeId=Store.id        
            WHERE Ag.bindingCode=?;`;
    values = [bindCode];
    sqlString = mysql.format(sql, values);
    try {
        results = await sqlAsync.query(req.db, sqlString);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({ errCode : 2, msg: 'Server 錯誤'});
    }
    if(results[0].bindCheck === 1) {
        sql = `INSERT INTO BindRequest
                (uid, agentId)
                VALUES (?, (SELECT id FROM AgentInfo WHERE bindingCode=?));`;
        values = [req.user.id, bindCode];
        sqlString = mysql.format(sql, values);
        try {
            await sqlAsync.query(req.db, sqlString);
        } catch (error) {
            req.logger.error(`${error.message}`);
            return res.json({ errCode : 2, msg: 'Server 錯誤'});
        }
    } else {
        sql = `INSERT INTO MemberInfo (
                uid, agentId, cash, credit, comment) 
                VALUES (?, (SELECT id FROM AgentInfo WHERE bindingCode=?), ?, ?, ?) 
                ;`;
        values = [req.user.id, bindCode, 0, 0, ''];
        sqlString = mysql.format(sql, values);
        
        try {
            await sqlAsync.query(req.db, sqlString);
        } catch (error) {
            req.logger.error(`${error.message}`);
            return res.json({ errCode : 2, msg: 'Server 錯誤' });
        }
    }
    
    return res.json({ errCode : 0, msg: 'success', data: {} });
};

// Form data validate generators
// Invoke it to produce a middleware for validating
function adValidator() {
	return [
		// All values must be string
		body('*')
			.isString().withMessage('Wrong data format'),

		// For each in data array
		body('storeId')
			.isLength({ min: 1 }).withMessage('storeId 不可爲空')
			.isLength({ max: 200 }).withMessage('storeId 長度不可超過 200')
			.isInt({ min: -1 }).withMessage('storeId必須是數字'),

		// Sanitize all values 
		sanitizeBody('*')
			.escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
			.trim(), // trim white space from both end 

	];
}

function bindValidator(){
    return [
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),
  
        // For each in data array
        body('bindCode')
            .isLength({ min:6 }).withMessage('綁定碼需為六位數')
            .isLength({ max:6 }).withMessage('綁定碼需為六位數')
            .isInt().withMessage('綁定碼需為數字'),
        body('bindCode').custom(async function (data, { req }) {
            let sql = `SELECT bindingCode From AgentInfo WHERE bindingCode=?;
                        SELECT Mem.id FROM MemberInfo AS Mem
                        INNER JOIN AgentInfo AS Ag
                            ON Mem.agentId=Ag.id
                        WHERE Mem.uid=? AND Ag.bindingCode=?;
                        SELECT Mem.id
                        FROM MemberInfo AS Mem
                        INNER JOIN UserAccount AS U1
                            ON Mem.uid=U1.id
                        INNER JOIN AgentInfo AS Ag
                            ON Mem.agentId=Ag.id
                        INNER JOIN StoreInfo AS Store
                            ON Ag.storeId=Store.id
                        INNER JOIN UserAccount AS U
                            ON Store.uid=U.id
                        WHERE U.id=(SELECT U2.id 
                                    FROM UserAccount AS U2
                                    INNER JOIN StoreInfo AS Store2
                                        ON Store2.uid=U2.id
                                    INNER JOIN AgentInfo AS Ag
                                        ON Ag.storeId=Store2.id
                                    WHERE Ag.bindingCode=?) 
                                AND U1.id=?;
                        `;
            let values = [data, req.user.id, data, data, req.user.id];
            let sqlString = mysql.format(sql, values);
            let results;
            try {
                results = await sqlAsync.query(req.db, sqlString);
            } catch (error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }
            if(results[0].length <= 0){
                throw Error('綁定碼 不存在');
            }
            if(results[1].length > 0){
                throw Error('無法重複綁定');
            }
            if(results[2].length > 0){
                throw Error('會員已綁定');
            }
            return true; 
        }),
        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 
  
    ];
}

module.exports = {
    list: listHandler,
    ad: adHandler,
    adValidate: adValidator(),
    bind: bindHandler,
    bindValidate: bindValidator(),
};
