const
    mysql = require('mysql'),
    sqlAsync = require('../../../libs/sqlAsync'),
    { body, validationResult } = require('express-validator/check'),
    { sanitizeBody } = require('express-validator/filter'),
    speakeasy = require("speakeasy");

// Page rendering
let renderHandler = async function (req, res) {

    // Collect all accounts infos managed by this user, including this user itself
    let managedAccounts = await getManagedUsers(req);

    // Extract agent and store from all managed users
    let agentsData = managedAccounts.reduce(function (arr, row) {
        if (row.role === 'agent') arr.push(row);
        return arr;
    }, []);

    let storesData = managedAccounts.reduce(function (arr, row) {
        if (row.role === 'store') arr.push(row);
        return arr;
    }, []);

    try {
        return res.render('home/personnel/member', {
            layout: 'home',
            agents: agentsData,
            stores: storesData,
        });
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.render('home/personnel/member', {
            layout: 'home'
        });
    }
};

let memberSearchHandler = async function (req, res) {
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
			memberAccount,
			storeAccount,
			agentAccount,
		} = req.body;
        // Collect all accounts infos managed by this user, including this user itself
        let managedAccounts;
        
        managedAccounts = await getManagedUsers(req);

        let sqlString, values, results;
		// Case 1 : search for specific account
		if (memberAccount && memberAccount.length > 0) {
			// Validate permission
			// If account is not found, then target user is invalid
			let targetUser = managedAccounts.find(row => (row.account === memberAccount));
			if (!targetUser) return res.json({ err: true, msg: '搜尋無效', data: [] });

            let roleString = ``;
            if( req.user.role === 'agent'){
                roleString = mysql.format('AND U2.id=?', req.user.id)
            } else if( req.user.role === 'store') {
                roleString = mysql.format('AND U3.id=?', req.user.id);
            } else if( req.user.role === 'admin') {

            } else {
                return res.json({ err: true, msg: '搜尋無效', data: [] });
            }
			// Get the transaction info of the user
			sqlString = `SELECT 
                            Mem.id, U1.account, U1.name, U1.GSCash AS gsCash, U1.email, U1.phoneNumber,
                            Mem.cash, Mem.credit, Mem.availBalance, Mem.comment, S.status,
                            U2.name AS agent, U3.name AS store,
                            DATE_FORMAT(CONVERT_TZ(Mem.createtime, 'UTC', 'Asia/Shanghai'),'%Y-%m-%d %H:%i:%s ') AS createtime,
                            DATE_FORMAT(CONVERT_TZ(Mem.updatetime, 'UTC', 'Asia/Shanghai'),'%Y-%m-%d %H:%i:%s ') AS updatetime
                        FROM MemberInfo AS Mem
                        INNER JOIN AgentInfo AS Ag
                            ON Mem.agentId=Ag.id
                        INNER JOIN StoreInfo AS Store
                            ON Ag.storeId=Store.id
                        INNER JOIN UserAccount AS U1
                            ON Mem.uid=U1.id
                        INNER JOIN UserAccount AS U2
                            ON Ag.uid=U2.id
                        INNER JOIN UserAccount AS U3
                            ON Store.uid=U3.id
                        INNER JOIN Status AS S
                            ON U1.statusId=S.id
                        WHERE U1.account=? ${roleString}
                        `;
			values = [memberAccount];
            sqlString = mysql.format(sqlString, values);
		}
		// Case 2 : search all user managed by this store
		else if (storeAccount && storeAccount.length > 0) {

			// Validate permission
			// If account is not found, then target user is invalid
			let targetUser = managedAccounts.find(row => ((row.account === storeAccount) && (row.role === 'store')));
            if (!targetUser) return res.json({ err: true, msg: '搜尋無效', data: [] });
            
			sqlString = `SELECT 
                            Mem.id, U1.account, U1.name, U1.GSCash AS gsCash, U1.email, U1.phoneNumber,
                            Mem.cash, Mem.credit, Mem.availBalance, Mem.comment, S.status,
                            U2.name AS agent, U3.name AS store,
                            DATE_FORMAT(CONVERT_TZ(Mem.createtime, 'UTC', 'Asia/Shanghai'),'%Y-%m-%d %H:%i:%s ') AS createtime,
                            DATE_FORMAT(CONVERT_TZ(Mem.updatetime, 'UTC', 'Asia/Shanghai'),'%Y-%m-%d %H:%i:%s ') AS updatetime
                        FROM MemberInfo AS Mem
                        INNER JOIN AgentInfo AS Ag
                            ON Mem.agentId=Ag.id
                        INNER JOIN StoreInfo AS Store
                            ON Ag.storeId=Store.id
                        INNER JOIN UserAccount AS U1
                            ON Mem.uid=U1.id
                        INNER JOIN UserAccount AS U2
                            ON Ag.uid=U2.id
                        INNER JOIN UserAccount AS U3
                            ON Store.uid=U3.id
                        INNER JOIN Status AS S
                            ON U1.statusId=S.id
                        WHERE U3.account=?
                        `;
			values = [storeAccount];
            sqlString = mysql.format(sqlString, values);
		}
		// Case 3 : search all user managed by this agent
		else if (agentAccount && agentAccount.length > 0) {

			// Validate permission
			// If account is not found, then target user is invalid
			let targetUser = managedAccounts.find(row => ((row.account === agentAccount) && (row.role === 'agent')));
			if (!targetUser) return res.json({ err: true, msg: '搜尋無效', data: [] });

			// Get the transaction info of the user
			sqlString = `SELECT 
                            Mem.id, U1.account, U1.name, U1.GSCash AS gsCash, U1.email, U1.phoneNumber,
                            Mem.cash, Mem.credit, Mem.availBalance, Mem.comment, S.status,
                            U2.name AS agent, U3.name AS store,
                            DATE_FORMAT(CONVERT_TZ(Mem.createtime, 'UTC', 'Asia/Shanghai'),'%Y-%m-%d %H:%i:%s ') AS createtime,
                            DATE_FORMAT(CONVERT_TZ(Mem.updatetime, 'UTC', 'Asia/Shanghai'),'%Y-%m-%d %H:%i:%s ') AS updatetime
                        FROM MemberInfo AS Mem
                        INNER JOIN AgentInfo AS Ag
                            ON Mem.agentId=Ag.id
                        INNER JOIN StoreInfo AS Store
                            ON Ag.storeId=Store.id
                        INNER JOIN UserAccount AS U1
                            ON Mem.uid=U1.id
                        INNER JOIN UserAccount AS U2
                            ON Ag.uid=U2.id
                        INNER JOIN UserAccount AS U3
                            ON Store.uid=U3.id
                        INNER JOIN Status AS S
                            ON U1.statusId=S.id
                        WHERE U2.account=?
                        `;
			values = [agentAccount];
            sqlString = mysql.format(sqlString, values);
		}
		// Case 4 : search all user managed by this user
		else {
            return res.json({ err: false, msg: 'success', data: [] });
		}

		// Add limit 
        sqlString += ` ORDER BY createtime desc LIMIT 20000;`;

		// Execute query
		results = await sqlAsync.query(req.db, sqlString);
		// Return data
		return res.json({ err: false, msg: 'success', data: results });

    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({
            err: true,
            msg: 'Sever Error'
        });
    }
}

// Datatable ajax create
let createHandler = async function (req, res) {
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

    // Gather all required data
    let {
        account,
        agentAccount,
        cash,
        credit,
        comment,
    } = req.body;

    // Convert from string
    cash = Number(cash);
    credit = Number(credit);

    // Prepare query
    sqlString = `   
                    SELECT Ag.*, U.name
                    FROM AgentInfo AS Ag
                    INNER JOIN UserAccount AS U
                        ON Ag.uid=U.id AND U.account=?
                    ;
                `;
    values = [agentAccount];
    sqlString = mysql.format(sqlString, values);

    // Get the agent of the new member
    // Execute query
    let agent;
    try {
        let results = await sqlAsync.query(req.db, sqlString);
        // Check result
        if (results.length <= 0) throw Error(`cannot find agent info of this user account[${agentAccount}] role[agent]`);
        agent = results[0];
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({
            err: true,
            msg: 'Server 錯誤'
        });
    }

    // Prepare query
    // Query for insert into MemberInfo
    let sqlStringInsert = `INSERT INTO MemberInfo (
                                uid, agentId, cash, credit, comment) 
                            VALUES ((SELECT id FROM UserAccount WHERE account=?), ?, ?, ?, ?) 
                            ;`;
    values = [account, agent.id, cash, credit ,comment];
    sqlStringInsert = mysql.format(sqlStringInsert, values);

    // Query for update AgentInfo cash 
    let sqlStringUpdate = ` UPDATE AgentInfo
                            SET cash=cash-?
                            WHERE id=?
                            ;`;
    values = [cash, agent.id];
    sqlStringUpdate = mysql.format(sqlStringUpdate, values);

    // Query for transaction record
    let sqlStringRecord1 = `INSERT INTO StoreTransaction 
                            (uid, transTypeCode, amount, relatedId, relatedName, storeId, comment)
                            VALUES (?, ?, ?, (SELECT id FROM UserAccount WHERE account=?), (SELECT name FROM UserAccount WHERE account=?), ?, ?);`;
    values = [agent.uid, 0, cash * -1, account, account, agent.storeId, '創建人員'];
    sqlStringRecord1 = mysql.format(sqlStringRecord1, values);

    let sqlStringRecord2 = `INSERT INTO StoreTransaction 
                            (uid, transTypeCode, amount, relatedId, relatedName, storeId, comment)
                            VALUES ((SELECT id FROM UserAccount WHERE account=?), ?, ?, ?, ?, ?, ?);`;
    values = [account, 1, cash, agent.uid, agent.name, agent.storeId, '創建人員'];
    sqlStringRecord2 = mysql.format(sqlStringRecord2, values);

    // No need for transaction if cash = 0
    if (cash === 0) {
        sqlStringRecord1 = ``;
        sqlStringRecord2 = ``;
    }

    // Insert new member
    // Execute transaction
    try {
        await sqlAsync.query(req.db, 'START TRANSACTION');
        await sqlAsync.query(req.db, sqlStringInsert + sqlStringUpdate + sqlStringRecord1 + sqlStringRecord2);
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
    req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] create a new user account[${account}] role[member] cash[${cash}] credit[${credit}] agentId[${agent.id}]`);

    return res.json({
        err: false,
        msg: 'success'
    });

};

// Datatable ajax update
let updateHandler = async function (req, res) {

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

    // Receive data array
    let updateData = req.body.data;

    // Prepare query
    // Query for update all members
    let sqlStringTmp = `UPDATE MemberInfo 
                        SET  credit=?, comment=?
                        WHERE id=?
                        ;
                        UPDATE UserAccount
                        SET name=?, email=?, phoneNumber=?
                        WHERE id=?
                        ;`;
    let sqlStringUpdate = '';
    for (let i = 0; i < updateData.length; i++) {
        let element = updateData[i];
        let tmp = `SELECT uid FROM MemberInfo WHERE id=?;`;
        let sqlString = mysql.format(tmp, element.id);
        let result;
        try {
            result = await sqlAsync.query(req.db, sqlString);
        }
        catch (error) {
            req.logger.error(`${error.message}`);
            return res.json({
                err: true,
                msg: 'Server 錯誤'
            });
        }
        let values = [element.credit, element.comment, element.id, element.name, element.email, element.phoneNumber, result[0].uid];
        sqlStringUpdate += mysql.format(sqlStringTmp, values);
    }
    // Execute all queries
    try {
        await sqlAsync.query(req.db, 'START TRANSACTION');
        await sqlAsync.query(req.db, sqlStringUpdate);
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
    for (let i = 0; i < updateData.length; i++) {
        req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] update user roleId[${updateData[i].id}] role[member] credit[${updateData[i].credit}] `);
    }

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

    let deleteData = req.body.data;

    // Prepare query, get agent for each member
    let sqlString = `SELECT 
                        Mem.id AS id, Ag.id AS agentId, Ag.uid AS agentUid, Ag.storeId AS storeId
                    FROM MemberInfo AS Mem
                    INNER JOIN AgentInfo AS Ag 
                        ON Mem.agentId=Ag.id
                    WHERE Mem.id IN (?)
                    ;`;
    let values = [deleteData.map((obj) => (obj.id))]; // bind a list of member id to the sql string
    sqlString = mysql.format(sqlString, values);

    // Get agent for each member
    // Execute query
    let agentList;
    try {
        let results = await sqlAsync.query(req.db, sqlString);

        // Check result
        if (results.length <= 0) throw Error(`cannot find agent of these users roleId[${deleteData.map(obj => obj.id).join()}] role[member]`);

        // Augment agentId for each member in update data 
        deleteData.forEach(function (member) {
            member.agentId = results.find(row => row.id === Number(member.id)).agentId;
        });

        // Get a distinct list of all involved agents
        agentList = results.map((row) => ({
            id: row.agentId,
            uid: row.agentUid,
            storeId: row.storeId,
        }));
        agentList = agentList.reduce(function (newList, agent) {
            if (!newList.find(element => element.id === agent.id))
                newList.push(agent);
            return newList;
        }, []);
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.json({
            err: true,
            msg: 'Server 錯誤'
        });
    }

    // Ready to delete
    // Start Trnasaction first
    try {
        await sqlAsync.query(req.db, 'START TRANSACTION');

        // For each agent, delete its members
        for (let i = 0; i < agentList.length; i++) {
            let curAgent = agentList[i];
            let curMemberList = deleteData.filter(member => member.agentId === curAgent.id);

            // Prepare query, get total cash of all the members that pepare to be deleted
            let sqlStringCash = `SELECT SUM(Mem.cash) AS totalCash, U.name
                                FROM MemberInfo AS Mem
                                INNER JOIN UserAccount AS U
                                    ON Mem.uid=U.id
                                WHERE Mem.id IN(?)
                                `;
            values = [curMemberList.map((member) => member.id)]; // bind a list of member id to the sql string
            sqlStringCash = mysql.format(sqlStringCash, values);

            // Get total cash of all the members that pepare to be deleted
            // Execute query
            let results = await sqlAsync.query(req.db, sqlStringCash);

            // Check result
            if (results.length <= 0) throw Error(`Cannot calculate SUM of all members' cash`);
            let { totalCash, name } = results[0];

            // Now, delete all members
            // Prepare query, return cash to agent?
            // let sqlStringDel = `DELETE U
            //                     FROM UserAccount AS U
            //                     WHERE U.id IN (   SELECT Mem.uid 
            //                                         FROM MemberInfo AS Mem
            //                                         WHERE Mem.id in (?) )
            //                     ;`;
            // values = [curMemberList.map((member) => member.id)]; // bind a list of member id to the sql string
            // sqlStringDel = mysql.format(sqlStringDel, values);

            let sqlStringDel = `Delete Mem
                            FROM MemberInfo AS Mem
                            WHERE Mem.id IN (?);`;
            values = [curMemberList.map((member) => member.id)];
            sqlStringDel = mysql.format(sqlStringDel, values);

            let sqlStringUpdate = `  UPDATE AgentInfo
                                    SET cash=cash+?
                                    WHERE id=?
                                    ;`;
            values = [totalCash, curAgent.id];
            sqlStringUpdate = mysql.format(sqlStringUpdate, values);

            // Query for transaction record
            let sqlStringRecord1 = `INSERT INTO StoreTransaction 
                                    (uid, transTypeCode, amount, relatedName, storeId, comment)
                                    VALUES (?, ?, ?, ?, ?, ?);`;
            values = [curAgent.uid, 1, totalCash, name, curAgent.storeId, '刪除人員'];
            sqlStringRecord1 = mysql.format(sqlStringRecord1, values);

            // No need for transaction if cash = 0
            if (totalCash === 0) {
                sqlStringRecord1 = ``;
            }

            // Execute all queries
            await sqlAsync.query(req.db, sqlStringDel + sqlStringUpdate + sqlStringRecord1);

            // log
            for (let i = 0; i < curMemberList.length; i++) {
                req.logger.verbose(`account[${req.user.account}] role[${req.user.role}] delete user roleId[${curMemberList[i].id}] role[member]`);
            }
            req.logger.verbose(`roleId[${curAgent.id}] role[agent] receive cash[${totalCash}] through deleting users`);
        }

    } catch (error) {
        await sqlAsync.query(req.db, 'ROLLBACK'); // rollback transaction if a statement produce error
        req.logger.error(`${error.message}`);
        return res.json({
            err: true,
            msg: 'Server 錯誤'
        });
    }
    await sqlAsync.query(req.db, 'COMMIT'); // commit transaction only if all statement has executed without error

    return res.json({
        err: false,
        msg: 'success'
    });
};


function createValidator() {
    return [
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each value
        
        body('account')
            .isLength({
                min: 1
            }).withMessage('帳號不可爲空')
            .isLength({
                max: 20
            }).withMessage('帳號長度不可超過 20')
            .isAlphanumeric().withMessage('帳號只能含有數字或英文字母'),

        body('agentAccount')
            .isLength({
                min: 1
            }).withMessage('代理商不可爲空')
            .isLength({
                max: 20
            }).withMessage('代理商帳號錯誤'),
        body('cash')
            .isNumeric({
                min: 0, max: 999999999999999
            }).withMessage('寶石額度必須介於 0 ～ 999999999999999 之間'),
        body('credit')
            .isNumeric({
                min: -999999999999999, max: 999999999999999
            }).withMessage('信用額度必須是數字'),
        body('comment')
            .isLength({
                min: 0,
                max: 40
            }).withMessage('備註長度不可超過 40'),

        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end

        // Check duplicate account in database
        body('account').custom(async function (data, { req }) {

            // Prepare query
            let sqlString = `SELECT * 
                            FROM UserAccount 
                            WHERE account=?`;
            let values = [data];
            sqlString = mysql.format(sqlString, values);

            // Check if duplicate account exists
            let results;
            try {
                results = await sqlAsync.query(req.db, sqlString);
            } catch (error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }

            if (results.length <= 0) throw Error('查無使用者帳號');
            if (results[0].role !== 'member') throw Error('請綁定會員帳號');

            return true;
        }),

        // Check if account has bind to same store already
        body('account').custom(async function (data, { req }) {
            // Prepare query
            let sqlString = `   
                                SELECT Ag.storeId
                                FROM AgentInfo AS Ag
                                INNER JOIN UserAccount AS U
                                    ON Ag.uid=U.id
                                WHERE U.account=?
                                ;
                            `;
            let values = [req.body.agentAccount];
            sqlString = mysql.format(sqlString, values);

            // Get store id
            let results;
            try {
                results = await sqlAsync.query(req.db, sqlString);
            } catch (error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }
            
            if (results.length <= 0) throw Error('代理商錯誤');
            let storeId = results[0].storeId;

            // Prepare query
            sqlString = `
                            SELECT Mem.id
                            FROM MemberInfo AS Mem
                            INNER JOIN AgentInfo AS Ag
                                ON Mem.agentId=Ag.id

                            INNER JOIN UserAccount AS U
                                ON Mem.uid=U.id
                            WHERE U.account=? AND Ag.storeId=?
                            ;
                        `;
            values = [data, storeId];
            sqlString = mysql.format(sqlString, values);

            // Check if account has bind to same store already
            try {
                results = await sqlAsync.query(req.db, sqlString);
            } catch (error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }

            if (results.length > 0) throw Error('已綁定過此店家');

            return true;
        }),

        // Check agent account against this user
        body('agentAccount').custom(async function (data, { req }) {

            if (req.user.role === 'agent' && req.user.account === data) {
                return true; // Agent account must equal to the user's account, if that user is a agent  
            }

            // Prepare query
            // Based on different of this user, we will use different query string
            let sqlString, values;

            sqlString = `SELECT Ag.id
                        FROM AgentInfo AS Ag
                        INNER JOIN UserAccount AS U
                            ON Ag.uid=U.id 
                        `;

            if (req.user.role === 'store') {
                sqlString += `WHERE Ag.storeId=? AND U.account=?;`;
            } else if(req.user.role === 'admin') {
                sqlString += `INNER JOIN StoreInfo AS Store
                                ON Store.id=Ag.storeId
                                WHERE Store.adminId=? AND U.account=?;`;  
            } else {
                // All other circumstances are invalid
                throw Error('代理商錯誤');
            }

            values = [req.user.roleId, data];
            sqlString = mysql.format(sqlString, values);

            // Check if this agent is managed by this user
            let results;
            try {
                results = await sqlAsync.query(req.db, sqlString);
            } catch (error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }

            if (results.length <= 0) throw Error('新增無效');

            return true;
        }),
    ];
}

function updateValidator() {
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
        body('data.*.name')
            .isLength({
                min: 1
            }).withMessage('名稱不可爲空')
            .isLength({
                max: 20
            }).withMessage('名稱長度不可超過 20'),
        body('data.*.credit')
            .isNumeric({
                min: -999999999999999, max: 999999999999999
            }).withMessage('信用額度必須是數字'),
        body('data.*.phoneNumber')
            .optional({
                checkFalsy: true
            }) // Use optional for isInt, this allows input to be "", 0, null and false, however we check whether it is string above, so it is fine
            .matches(/((?=(09))[0-9]{10})$/, 'g').withMessage('請輸入10位數電話號碼'),
        body('data.*.email')
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
        body('data.*.comment')
            .isLength({
                min: 0,
                max: 40
            }).withMessage('備註長度不可超過 40'),

        // Sanitize all values 
        sanitizeBody('data.*.*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end

        // Check permission from database
        body('data.*.id').custom(async function (data, {
            req
        }) {

            // Prepare query
            // Based on different of this user, we will use different query string
            let sqlString, values;

            sqlString = `SELECT Mem.id
                         FROM MemberInfo AS Mem
                        `;

            if (req.user.role === 'agent') {
                sqlString += `WHERE Mem.agentId=? AND Mem.id=?;`;
            } else if (req.user.role === 'store') {
                sqlString += `  INNER JOIN AgentInfo AS Ag
                                    ON Mem.agentId=Ag.id AND Ag.storeId=?
                                WHERE Mem.id=?
                                ;`;
            } else if (req.user.role === 'admin')
            if (req.user.role === 'admin') {
                sqlString += `
                            INNER JOIN AgentInfo AS Ag
                                ON Mem.agentId=Ag.id
                            INNER JOIN StoreInfo AS Store
                                ON Ag.storeId=Store.id
                            INNER JOIN AdminInfo AS Adm
                                ON Store.adminId=Adm.id
                            WHERE Adm.id=? AND Mem.id=?
                            ;
                            `;
            } else {
                // Invalid role
                throw Error('更新無效');
            }
            values = [req.user.roleId, data];
            sqlString = mysql.format(sqlString, values);
            // Check if this agent is valid for this user to update
            let results;
            try {
                results = await sqlAsync.query(req.db, sqlString);
            } catch (error) {
                req.logger.error(`${error.message}`);
                throw Error('Server 錯誤');
            }

            if (results.length <= 0) throw Error('更新無效');

            return true;
        }),
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
            // Based on different of this user, we will use different query string
            let sqlString, values;

            sqlString = `SELECT Mem.id
                         FROM MemberInfo AS Mem
                        `;

            if (req.user.role === 'agent') {
                sqlString += ` WHERE Mem.agentId=? AND Mem.id=?;`;
            } else if (req.user.role === 'store') {
                sqlString += `  INNER JOIN AgentInfo AS Ag
                                    ON Mem.agentId=Ag.id AND Ag.storeId=?
                                WHERE Mem.id=?
                                ;`;
            } else if (req.user.role === 'admin') {
                sqlString += ` INNER JOIN AgentInfo AS Ag
                                    ON Mem.agentId=Ag.id
                                INNER JOIN StoreInfo AS Store
                                    ON Ag.storeId=Store.id
                                WHERE Store.adminId=?
                                ;`;  
            } else {
                // Invalid role
                throw Error('刪除無效');
            }
            values = [req.user.roleId, data];
            sqlString = mysql.format(sqlString, values);

            // Check if this agent is valid for this user to delete
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

let memberSearchValidator = function () {
    return [
        // Check format
        // All values must be string
        body('storeAccount')
            .isLength({ max: 20 }).withMessage('帳號長度不可超過 20')
            .optional({ checkFalsy: true }) // Use optional for isInt, this allows input to be "", 0, null and false, however we check whether it is string above, so it is fine
            .isAlphanumeric().withMessage('帳號只能含有數字或英文字母'),
        body('agentAccount')
            .isLength({ max: 20 }).withMessage('帳號長度不可超過 20')
            .optional({ checkFalsy: true }) // Use optional for isInt, this allows input to be "", 0, null and false, however we check whether it is string above, so it is fine
            .isAlphanumeric().withMessage('帳號只能含有數字或英文字母'),
        body('memberAccount')
            .isLength({ max: 20 }).withMessage('帳號長度不可超過 20')
            .optional({ checkFalsy: true }) // Use optional for isInt, this allows input to be "", 0, null and false, however we check whether it is string above, so it is fine
            .isAlphanumeric().withMessage('帳號只能含有數字或英文字母'),

        // Sanitize all values 
        sanitizeBody(['storeAccount', 'memberAccount', 'agentAccount'])
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end
    ];
};

async function getManagedUsers(req) {
	// Prepare query
	let sqlString, values;
	if (req.user.role === 'agent') {
		sqlString = `(
                        SELECT U.id AS uid, U.account, Ag.id, U.name, Ag.cash, U.role
                        FROM AgentInfo AS Ag
                        INNER JOIN UserAccount AS U
                            ON U.id=Ag.uid
                        WHERE Ag.id=?
                    )
                    UNION
                    (
                        SELECT U.id AS uid, U.account, Mem.id, U.name, Mem.cash, U.role
                        FROM MemberInfo AS Mem
                        INNER JOIN UserAccount AS U
                            ON U.id=Mem.uid
                        WHERE Mem.agentId=?
                    )
                    ;`;
		values = [req.user.roleId, req.user.roleId];
		sqlString = mysql.format(sqlString, values);
	}
	else if (req.user.role === 'store') {
		sqlString = `(
                        SELECT U.id AS uid, U.account, store.id, U.name, store.cash, U.role 
                        FROM StoreInfo AS store
                        INNER JOIN UserAccount AS U
                            ON U.id=store.uid
                        WHERE store.id=?
                    )
                    UNION
                    (
                        SELECT U.id AS uid, U.account, Ag.id, U.name, Ag.cash, U.role
                        FROM AgentInfo AS Ag
                        INNER JOIN UserAccount AS U
                            ON U.id=Ag.uid
                        WHERE Ag.storeId=?
                    )
                    UNION
                    (
                        SELECT U.id AS uid, U.account, Mem.id, U.name, Mem.cash, U.role
                        FROM MemberInfo AS Mem
                        INNER JOIN UserAccount AS U
                            ON U.id=Mem.uid

                        INNER JOIN AgentInfo AS Ag
                            ON Ag.id=Mem.agentId
                        WHERE Ag.storeId=?
                    )
                    ;`;
		values = [req.user.roleId, req.user.roleId, req.user.roleId];
		sqlString = mysql.format(sqlString, values);
	}
	else if (req.user.role === 'admin') {
		sqlString = `(
                        SELECT U.id AS uid, U.account, Adm.id, U.name, Adm.cash, U.role
                        FROM AdminInfo AS Adm
                        INNER JOIN UserAccount AS U
                            ON U.id=Adm.uid

                        WHERE Adm.id=?
                    )
                    UNION
                    (
                        SELECT U.id AS uid, U.account, store.id, U.name, store.cash, U.role
                        FROM StoreInfo AS store
                        INNER JOIN UserAccount AS U
                            ON U.id=store.uid

                        WHERE store.adminId=?
                    )
                    UNION
                    (   
                        SELECT U.id AS uid, U.account, Ag.id, U.name, Ag.cash, U.role
                        FROM AgentInfo AS Ag
                        INNER JOIN UserAccount AS U
                            ON U.id=Ag.uid

                        INNER JOIN StoreInfo AS store
                            ON store.id=Ag.storeId AND store.adminId=?
                    )
                    UNION
                    (
                        SELECT U.id AS uid, U.account, Mem.id, U.name, Mem.cash, U.role
                        FROM MemberInfo AS Mem
                        INNER JOIN UserAccount AS U
                            ON U.id=Mem.uid

                        INNER JOIN AgentInfo AS Ag
                            ON Ag.id=Mem.agentId
                        INNER JOIN StoreInfo AS store
                            ON store.id=Ag.storeId AND store.adminId=?
                    )
                    ;`;
		values = [req.user.roleId, req.user.roleId, req.user.roleId, req.user.roleId];
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

module.exports = {
    render: renderHandler,

    create: createHandler,
    createValidate: createValidator(),

    update: updateHandler,
    updateValidate: updateValidator(),

    delete: deleteHandler,
    deleteValidate: deleteValidator(),

    search: memberSearchHandler,
    searchValidate: memberSearchValidator(),
};