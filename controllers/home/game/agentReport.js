const
    mysql = require('mysql'),
    sqlAsync = require('../../../libs/sqlAsync'),
    { body, validationResult } = require('express-validator/check'),
    { sanitizeBody } = require('express-validator/filter'),
    moment = require('moment');

const max = 999999999;
// Page rendering
let renderHandler = async function (req, res) {

    // Collect all data
    let agentsData = await getManagedAgentsData(req);
    try {
        return res.render('home/game/agentReport', {
            layout: 'home',
            agents: agentsData,
        });
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.render('home/game/agentReport', {
            layout: 'home'
        });
    }
};

let agentReportSearchHandler = async function (req, res) {
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
            agentId,
            memberAccount,
            datetimes,
        } = req.body;
        let datetime = datetimes.split("-");
        let start = datetime[0].trim();
        let end = datetime[1].trim();
        let sqlString, values, results;

        let storesData = await getStoresData(req, agentId);
        let agentsData = await getAgentsData(req, agentId);
        let gamesData = await getGamesData(req);
        
        const storeObj = await arrayToObject(storesData);
        const agentObj = await arrayToObject(agentsData);
        const gameObj = await arrayToObject(gamesData);

        let memberStr = '';
        let memberUid = await getMemberData(req, memberAccount);
        if(memberUid.length > 0) {
            memberStr = ` AND GT.relateUid=${memberUid[0].id}`;
        }
        sqlString = `SELECT GT.storeId, GT.agentId, G.id AS gameId, G.name AS gameName, U.name AS playerName, GT.amount AS result, GT.createtime
                    FROM GameTransaction AS GT
                    INNER JOIN GameInfo AS G
                        ON G.id=GT.gameId
                    INNER JOIN UserAccount AS U
                        ON U.id=GT.relateUid
                    WHERE GT.uid=? AND (GT.createtime BETWEEN ? AND ?) ${memberStr};`;
        values = [agentObj[agentId].uid, start, end];
        sqlString = mysql.format(sqlString, values);
		// Execute query
        results = await sqlAsync.query(req.db, sqlString);

        let data = await results.map((item) => {
            let agentName = agentObj[item.agentId].name;
            let storeName = storeObj[item.storeId].name;
            let agentProfit = Math.floor(agentObj[item.agentId].rtp * Number(item.result) * 0.01);
            let cost = gameObj[item.gameId].profit + gameObj[item.gameId].cost;
            let systemProfit = Math.ceil(cost * Number(item.result) * 0.01);
            let storeProfit = Math.floor(item.result - agentProfit - systemProfit);
            let data = {
                storeName: storeName,
                agentName: agentName,
                playerName: item.playerName,
                gameName: item.gameName,
                result: Math.floor(item.result),
                storeProfit: storeProfit,
                agentProfit: agentProfit,
                systemProfit: systemProfit,
                time: item.createtime
            }
            return data;
        });
		// Return data
		return res.json({ err: false, msg: 'success', data: data });

    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({
            err: true,
            msg: 'Server Error'
        });
    }
}

let agentReportSearchValidator = function () {
    return [
        // Check format
        // All values must be string
        body('agentId')
            .isLength({ max: 20 }).withMessage('長度不可超過 20')
            .isNumeric().withMessage('agentId需為數字'),
        body('agentId').custom(async function(data, {req}) {
            let sql, values, sqlString;
            if(req.user.role === 'admin') {
                sql = `SELECT A.id
                        FROM AgentInfo AS A
                        INNER JOIN StoreInfo AS Store
                        ON Store.id=A.storeId
                        INNER JOIN AdminInfo AS Adm
                        ON Adm.id=Store.adminId
                        WHERE A.id=? AND Adm.id=?;`;
                values = [data, req.user.roleId];
                sqlString = mysql.format(sql, values);
            } else if(req.user.role === 'store') {
                sql = `SELECT A.id
                        FROM AgentInfo AS A
                        INNER JOIN StoreInfo AS Store
                        ON Store.id=A.storeId
                        WHERE A.id=? AND Store.id=?;`;
                values = [data, req.user.roleId];
                sqlString = mysql.format(sql, values);
            } else if(req.user.role === 'agent') {
                sql = `SELECT A.id
                        FROM AgentInfo AS A
                        WHERE A.id=?;`;
                values = [data];
                sqlString = mysql.format(sql, values);
            } else {
                throw('權限不足');
            }
            let result = await sqlAsync.query(req.db, sqlString);
            if(result.length === 0) throw('查無此代理');
            else return true;
        }),
        body('memberAccount')
            .optional({
                checkFalsy: true,
                nullable: true,
            })
            .isLength( { max: 20 }).withMessage('長度不可超過 20')
            .isAlphanumeric().withMessage('需為英文或數字')
            .custom(async function(data, {req}) {
                let result = await getMemberData(req, data);
                if(result.length > 0) return true;
                else throw('查無此玩家');
            }),
        body('datetimes')
                .isLength({ max:40 }).withMessage('日期長度不可超過 40')
                .custom(function(data){
                    let datetimes = data.split("-");
                    if(datetimes.length !== 2) throw Error(`日期格式錯誤`);
                    let re = /^\d\d\d\d\/(0?[1-9]|1[0-2])\/(0?[1-9]|[12][0-9]|3[01]) (00|0[0-9]|[0-9]|1[0-9]|2[0-3]):([0-9]|[0-5][0-9])$/;
                    for(let i = 0; i < datetimes.length; i++){
                        let d = datetimes[i].trim();
                        if(!d.match(re)){
                            throw Error(`日期格式錯誤`);
                        }
                    }
    
                    // Check range
                    let startTime = moment(datetimes[0].trim(), 'YYYY/MM/DD HH:mm');
                    let endTime = moment(datetimes[1].trim(), 'YYYY/MM/DD HH:mm');
                    let days = endTime.diff(startTime, 'days');
                    if(days > 60)   throw Error(`搜尋天數超過 60 天`);

                    return true;
                    
                }),

        // Sanitize all values 
        sanitizeBody(['agentId', 'memberAccount'])
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end
    ];
};

async function getManagedAgentsData(req) {
	// Prepare query
	let sqlString, values;
    if (req.user.role === 'admin') {
		sqlString = `
                        SELECT U.id AS uid, U.account, A.id, U.name
                        FROM AgentInfo AS A
                        INNER JOIN StoreInfo AS Store
                            ON Store.id=A.storeId
                        INNER JOIN AdminInfo AS Adm
                            ON Store.adminId=Adm.id
                        INNER JOIN UserAccount AS U
                            ON U.id=A.uid
                        WHERE Adm.id=?
                    ;`;
		values = [req.user.roleId];
		sqlString = mysql.format(sqlString, values);
	} else if(req.user.role === 'store') {
        sqlString = `
                        SELECT U.id AS uid, U.account, A.id, U.name
                        FROM AgentInfo AS A
                        INNER JOIN StoreInfo AS Store
                            ON Store.id=A.storeId
                        INNER JOIN UserAccount AS U
                            ON U.id=A.uid
                        WHERE Store.id=?
                    ;`;
		values = [req.user.roleId];
		sqlString = mysql.format(sqlString, values);
    } else if( req.user.role === 'agent') {
        sqlString = `
                SELECT U.id AS uid, U.account, A.id, U.name
                FROM AgentInfo AS A
                WHERE A.id=?
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

async function getAgentsData(req, agentId) {
	// Prepare query
	let sqlString, values;
    
    sqlString = `
                    SELECT A.id, A.uid, U.name, A.rtp
                    FROM AgentInfo AS A
                    INNER JOIN UserAccount AS U
                        ON U.id=A.uid
                    WHERE A.id=?
                ;`;
    values = [agentId];
    sqlString = mysql.format(sqlString, values);

	// Execute query
	let results = await sqlAsync.query(req.db, sqlString);

	return results;
}

async function getStoresData(req, agentId) {
	// Prepare query
	let sqlString, values;
    
    sqlString = `
        SELECT Store.id, Store.uid, U.name
        FROM StoreInfo AS Store
        INNER JOIN AgentInfo AS A
            ON Store.id=A.storeId
        INNER JOIN UserAccount AS U
            ON U.id=Store.uid
        WHERE A.id=?
                ;`;
    values = [agentId];
    sqlString = mysql.format(sqlString, values);
	// Execute query
	let results = await sqlAsync.query(req.db, sqlString);

	return results;
}

async function getGamesData(req) {
	// Prepare query
	let sqlString;
    
    sqlString = `
                    SELECT G.id, G.profit, G.cost
                    FROM GameInfo AS G
                ;`;
	// Execute query
	let results = await sqlAsync.query(req.db, sqlString);

	return results;
}

async function getMemberData(req, memberAccount) {
	// Prepare query
	let sqlString, values;
    if(memberAccount.length === 0) return []; 
    sqlString = `
        SELECT U.id
        FROM UserAccount AS U
        WHERE U.account=?;`;
    values = [memberAccount];
    sqlString = mysql.format(sqlString, values);
	// Execute query
	let results = await sqlAsync.query(req.db, sqlString);

	return results;
}

async function arrayToObject(array) {
    return array.reduce((obj, item) => {
        obj[item.id] = item
        return obj
    }, {});
}

module.exports = {
    render: renderHandler,
    search: agentReportSearchHandler,
    searchValidate: agentReportSearchValidator(),
};