const
    mysql = require('mysql'),
    sqlAsync = require('../../../libs/sqlAsync'),
    { body, validationResult } = require('express-validator/check'),
    { sanitizeBody } = require('express-validator/filter');

// Page rendering
let renderHandler = async function (req, res) {
    try {
        return res.render('home/game/gameList', {
            layout: 'home',
        });
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.render('home/game/gameList', {
            layout: 'home'
        });
    }
};

let readHandler = async function (req, res) {
    try {
        if(req.user.role !== 'store') return res.json({err: false, msg: '', data: null})
        let sqlString, values, results;
		
        sqlString = `SELECT G.name AS gameName, G.imageSrc AS gameSrc, G.createtime
                    FROM StoreGame AS SG
                    INNER JOIN GameInfo AS G
                        ON SG.gameId=G.id
                    WHERE SG.storeId=?;`;
        values = [req.user.roleId];
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

module.exports = {
    render: renderHandler,
    read: readHandler,
};