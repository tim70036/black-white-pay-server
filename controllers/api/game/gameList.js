const
    { body, validationResult } = require('express-validator/check'),
    { sanitizeBody } = require('express-validator/filter'),
    mysql = require('mysql'),
    sqlAsync = require('../../../libs/sqlAsync');

let gameListHandler = async function (req, res, next) {
    const result = validationResult(req);

    // If the form data is invalid
	if (!result.isEmpty()) {
		// Return the first error to client
		let firstError = result.array()[0].msg;
		return res.json({ errCode: 1, msg: firstError });
    }

    // Gather all required data
    let {
        storeId,
    } = req.body;

    // get gameInfo the store have
    let sqlString = `   SELECT G.id, G.name, G.code, G.provider, G.imageSrc
                        FROM GameInfo AS G
                        INNER JOIN StoreGame AS SG
                            ON G.id=SG.gameId
                        WHERE SG.storeId=?;
                    `;
    let values = [storeId];
    sqlString = mysql.format(sqlString, values);

    let results;
    try {
        results = await sqlAsync.query(req.db, sqlString);
    }
    catch(error) {
        req.logger.error(`${error.message}`);
        return res.json({ errCode: 2, msg: 'Server 錯誤' });
    }

    req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] get gameList with currency[${storeId}]`);

    return res.json({ errCode: 0, msg: 'success', data: results});
}

// Form data validate generators
// Invoke it to produce a middleware for validating
function gameListValidator(){
    return [
        // ALL values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('storeId')
            .isLength({ min: 1 }).withMessage('storeId 不可為空')
            .isLength({ max: 200 }).withMessage('storeId 長度不可超過 200')
            .isInt({ min: -1 }).withMessage('storeId 必須是數字'),
        
        // Sanitize all values
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end

        // check storeId
        // 1. user must be the member of the store
        // 2. ban mainCurrency now, would be available in the future
        body('storeId').custom(async function(data, {req}){
            let storeId = Number(data);
            console.log({storeId});
            // check 2.
            if (storeId === -1) throw Error('魂幣尚未開放');
            
            // check 1.
            // Prepare query
            let sqlString = `   SELECT Mem.id
                                FROM MemberInfo AS Mem
                                INNER JOIN UserAccount AS U
                                    ON Mem.uid = U.id
                                INNER JOIN AgentInfo AS Ag
                                    ON Mem.agentId = Ag.id
                                WHERE U.id=? AND Ag.storeId=?;
                            `;
            let values = [req.user.id, storeId];
            sqlString = mysql.format(sqlString, values);
            let results;
            try {
                results = await sqlAsync.query(req.db, sqlString);
            }
            catch(error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }

            if(results.length <= 0) throw Error('無法使用此幣種');

            return true;
        }),
    ];
}

module.exports = {
    gameList: gameListHandler,
    gameListValidate: gameListValidator(),
}