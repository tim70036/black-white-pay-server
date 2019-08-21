const
    mysql = require('mysql'),
    sqlAsync = require('../../../libs/sqlAsync'),
    { body, validationResult } = require('express-validator/check'),
    { sanitizeBody } = require('express-validator/filter');

const max = 999999999;
// Page rendering
let renderHandler = async function (req, res) {

    // Collect all data
    let storesData = await getManagedStoresData(req);
    let gamesData = await getManagedGamesData(req);

    try {
        return res.render('home/game/management', {
            layout: 'home',
            stores: storesData,
            games: gamesData,
        });
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.render('home/game/management', {
            layout: 'home'
        });
    }
};

let gameListSearchHandler = async function (req, res) {
    try {
        const validateResult = validationResult(req);

        // If the form data is invalid
        if (!validateResult.isEmpty()) {
            // Return the first error to client
            let firstError = validateResult.array()[0].msg;
            return res.json({
                err: true,
                msg: firstError
            });
        }

        let {
            storeId,
        } = req.body;
        let sqlString, values, results;
		
        sqlString = `SELECT SG.storeId, SG.gameId, G.name AS gameName, G.imageSrc AS gameSrc, G.provider, G.createtime
                    FROM StoreGame AS SG
                    INNER JOIN GameInfo AS G
                        ON SG.gameId=G.id
                    INNER JOIN StoreInfo AS Store
                        ON Store.id=SG.storeId
                    WHERE Store.id=?;`;
        values = [storeId];
        sqlString = mysql.format(sqlString, values);
        
		// Execute query
		results = await sqlAsync.query(req.db, sqlString);
		// Return data
		return res.json({ err: false, msg: 'success', data: results });

    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({
            err: true,
            msg: 'Server Error'
        });
    }
}

let addHandler = async function (req, res) {
    try {
        const validateResult = validationResult(req);

        // If the form data is invalid
        if (!validateResult.isEmpty()) {
            // Return the first error to client
            let firstError = validateResult.array()[0].msg;
            return res.json({
                err: true,
                msg: firstError
            });
        }

        let {
            storeId,
            gameId,
        } = req.body;

        let sqlString, values, results;
		
        sqlString = `INSERT INTO StoreGame (storeId, gameId) VALUES (?, ?);`;
        values = [storeId, gameId];
        sqlString = mysql.format(sqlString, values);
        
		// Execute query
		results = await sqlAsync.query(req.db, sqlString);
		// Return data
		return res.json({ err: false, msg: 'success', data: null });

    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({
            err: true,
            msg: 'Server Error'
        });
    }
}

let deleteHandler = async function (req, res) {
    try {
        const validateResult = validationResult(req);

        // If the form data is invalid
        if (!validateResult.isEmpty()) {
            // Return the first error to client
            let firstError = validateResult.array()[0].msg;
            return res.json({
                err: true,
                msg: firstError
            });
        }

        let {
            storeId,
            gameId,
        } = req.body;

        let sqlString, values, results;
		
        sqlString = `DELETE FROM StoreGame
                    WHERE storeId=? AND gameId=?;`;
        values = [storeId, gameId];
        sqlString = mysql.format(sqlString, values);
        
		// Execute query
		results = await sqlAsync.query(req.db, sqlString);
		// Return data
		return res.json({ err: false, msg: 'success', data: null });

    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({
            err: true,
            msg: 'Server Error'
        });
    }
}

let gameListSearchValidator = function () {
    return [
        // Check format
        // All values must be string
        body('storeId')
            .isLength({ max: 20 }).withMessage('長度不可超過 20')
            .isNumeric().withMessage('storeId需為數字'),
        body('storeId').custom(async function(data, {req}) {
            let sql = `SELECT Store.id FROM StoreInfo AS Store WHERE Store.id=?;`
            let values = [data];
            let sqlString = mysql.format(sql, values);
            let result = await sqlAsync.query(req.db, sqlString);
            if(result.length === 0) throw('查無此店家');
            else return true;
        }),

        // Sanitize all values 
        sanitizeBody(['storeId'])
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end
    ];
};

let addValidator = function () {
    return [
        // Check format
        // All values must be string
        body('storeId')
            .isLength({ max: 20 }).withMessage('長度不可超過 20')
            .isNumeric().withMessage('storeId需為數字'),
        body('storeId').custom(async function(data, {req}) {
            let sql = `SELECT Store.id FROM StoreInfo AS Store WHERE Store.id=?;`
            let values = [data];
            let sqlString = mysql.format(sql, values);
            let result = await sqlAsync.query(req.db, sqlString);
            if(result.length === 0) throw('查無此店家');
            else return true;
        }),

        body('gameId')
            .isLength({ max: 20 }).withMessage('長度不可超過 20')
            .isNumeric().withMessage('storeId需為數字'),
        body('gameId').custom(async function(data, {req}) {
            let sql = `SELECT G.id FROM GameInfo AS G WHERE G.id=?;`
            let values = [data];
            let sqlString = mysql.format(sql, values);
            let result = await sqlAsync.query(req.db, sqlString);
            if(result.length === 0) throw('查無此遊戲');

            const { storeId, gameId } = req.body;
            sql = `SELECT SG.id FROM StoreGame AS SG
                    WHERE SG.storeId=? AND SG.gameId=?;`;
            values = [storeId, gameId];
            sqlString = mysql.format(sql, values);
            result = await sqlAsync.query(req.db, sqlString);
            if(result.length > 0) throw('此遊戲已加入');
            return true;
        }),

        // Sanitize all values 
        sanitizeBody(['storeId'])
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end
    ];
};

let deleteValidator = function () {
    return [
        // Check format
        // All values must be string
        body('storeId')
            .isInt({ min: 0, max: max }).withMessage('storeId錯誤'),
        body('storeId').custom(async function(data, {req}) {
            let sql = `SELECT Store.id FROM StoreInfo AS Store WHERE Store.id=?;`
            let values = [data];
            let sqlString = mysql.format(sql, values);
            let result = await sqlAsync.query(req.db, sqlString);
            if(result.length === 0) throw('查無此店家');
            else return true;
        }),

        body('gameId')
            .isInt({ min: 0, max: max }).withMessage('gameId錯誤'),
        body('gameId').custom(async function(data, {req}) {
            let sql = `SELECT G.id FROM GameInfo AS G WHERE G.id=?;`
            let values = [data];
            let sqlString = mysql.format(sql, values);
            let result = await sqlAsync.query(req.db, sqlString);
            if(result.length === 0) throw('查無此遊戲');

            const { storeId, gameId } = req.body;
            sql = `SELECT SG.id FROM StoreGame AS SG
                    WHERE SG.storeId=? AND SG.gameId=?;`;
            values = [storeId, gameId];
            sqlString = mysql.format(sql, values);
            result = await sqlAsync.query(req.db, sqlString);
            if(result.length === 0) throw('店家尚未加入此遊戲');
            return true;
        }),

        // Sanitize all values 
        sanitizeBody(['storeId', 'gameId'])
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end
    ];
};

async function getManagedStoresData(req) {
	// Prepare query
	let sqlString, values;
    if (req.user.role === 'admin') {
		sqlString = `
                        SELECT U.id AS uid, U.account, store.id, U.name
                        FROM StoreInfo AS store
                        INNER JOIN UserAccount AS U
                            ON U.id=store.uid
                        WHERE store.adminId=?
                    ;`;
		values = [req.user.roleId];
		sqlString = mysql.format(sqlString, values);
	}
	else {
		// Invalid role
		throw Error('invalid role');
	}

	// Execute query
	let results = await sqlAsync.query(req.db, sqlString);

	return results;
}

async function getManagedGamesData(req) {
    let sqlString, values;
    if (req.user.role === 'admin') {
		sqlString = `SELECT G.id, G.name FROM GameInfo AS G;`;
	}
	else {
		// Invalid role
		throw Error('invalid role');
	}

	// Execute query
	let results = await sqlAsync.query(req.db, sqlString);

	return results;
}

module.exports = {
    render: renderHandler,
    search: gameListSearchHandler,
    searchValidate: gameListSearchValidator(),

    add: addHandler,
    addValidate: addValidator(),
    delete: deleteHandler,
    deleteValidate: deleteValidator(),
};