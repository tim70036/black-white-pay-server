const 
    sqlAsync = require('../../libs/sqlAsync'),
    util = require('../../libs/util'),
    emoji = require('node-emoji'),
    { body, validationResult } = require('express-validator/check'),
    { sanitizeBody } = require('express-validator/filter'),
    mysql = require('mysql'),
    moment = require('moment');


    let expenditureHandler = async function(req, res){
        try {
    
            // let managedData = await getExpenditureData(req);
            let managedAccounts = await getManagedUsers(req);
            // Extract agent and store from all managed users
            let agentsData = managedAccounts[0].reduce(function(arr, row){
                if(row.role === 'agent')    arr.push(row);
                return arr;
            }, []);

            let storesData = managedAccounts[0].reduce(function(arr, row){
                if(row.role === 'store')    arr.push(row);
                return arr;
            }, []);

            let currencyData = managedAccounts[1];

            // Get transType
            let sqlString= ` SELECT * FROM TransType;`;
            let transTypeData = await sqlAsync.query(req.db, sqlString);
            
            return res.render('home/report/expenditure', {layout : 'home', agentsData : agentsData, storesData : storesData, currencyData: currencyData, transTypeData : transTypeData});
        } catch (error) {
            req.logger.error(`${error.message}`);
            res.render('home/report/expenditure', {layout : 'home'});
        }
    
    };
    
    let expenditureSearchHandler = async function(req, res){
        try{
            const validateResult = validationResult(req);
            
            // If the form data is invalid
            if (!validateResult.isEmpty()) {
                // Return the first error to client
                let firstError = validateResult.array()[0].msg;
                return res.json({errCode: 1, msg: firstError, data: []});
            }
            let managedAccounts = await getManagedUsers(req);
            let sql, sqlString, values, results;
            let uid = req.user.id;
            const 
                  { storeAccount, 
                    agentAccount, 
                    memberAccount,
                    currencyName,
                    transType,  
                    datetimes } = req.body;
          
            let datetime = datetimes.split("-");
            let start = datetime[0].trim();
            let end = datetime[1].trim();

            let timeString = mysql.format(`AND (ST.createtime BETWEEN ? AND ?)`, [start, end]);
            let transTypeString = ``;

            sql= `SELECT Store.id
                    FROM StoreInfo AS Store
                    INNER JOIN UserAccount AS U
                        ON Store.uid=U.id
                    WHERE U.account=?;`;
            sqlString = mysql.format(sql, currencyName);

            results = await sqlAsync.query(req.db, sqlString);
            let storeId = 0;
            if(results.length > 0){
                storeId = results[0].id;
            }
            if(transType.length > 0){
                transTypeString = mysql.format(`AND ST.transTypeCode IN (?)`, [transType]);
            }

            if(memberAccount && memberAccount.length > 0){

                // Validate permission
                // If account is not found, then target user is invalid
                let targetUser = managedAccounts[0].find( row => (row.account === memberAccount));
                if(!targetUser) return res.json({errCode: 1, msg: '查無此用戶', data: []});
                
                // Determine update table for sender and receiver 
                targetUser.table = util.roleToTable(targetUser.role);
    
                // Get the transaction info of the user
                sqlString =`(
                                SELECT 
                                    U1.account, U.role, 
                                    ST.id AS tid, ST.transTypeCode, TT.transTypeDescription AS transType, ST.amount, ST.relatedName AS name, ST.comment, 
                                    DATE_FORMAT(CONVERT_TZ(ST.createtime, 'UTC', 'Asia/Shanghai'),'%Y-%m-%d %H:%i:%s ') AS createtime
                                FROM UserAccount AS U
                                
                                INNER JOIN StoreTransaction AS ST
                                    ON ST.uid=U.id
                                INNER JOIN TransType AS TT
                                    ON ST.transTypeCode=TT.transTypeCode
                                INNER JOIN UserAccount AS U1
                                    ON ST.relatedId=U1.id
                                WHERE U.id=? AND ST.storeId=? ${timeString}  ${transTypeString}
                            )
                            `;
                values=[targetUser.uid, storeId];
                sqlString = mysql.format(sqlString, values);
            }

            // Case 2 : search all user managed by this store
        else if(storeAccount && storeAccount.length > 0){

            // Validate permission
            // If account is not found, then target user is invalid
            let targetUser = managedAccounts[0].find( row => ( (row.account === storeAccount) && (row.role === 'store')) );
            if(!targetUser) return res.json({errCode: 1, msg: '查無此用戶', data: []});

            // Get the transaction info of all user managed by this store
            sqlString =`(
                            SELECT 
                                U1.account, U.role, 
                                ST.id AS tid, ST.transTypeCode, TT.transTypeDescription AS transType, ST.amount, ST.relatedName AS name, ST.comment, 
                                DATE_FORMAT(CONVERT_TZ(ST.createtime, 'UTC', 'Asia/Shanghai'),'%Y-%m-%d %H:%i:%s ') AS createtime
                            FROM StoreInfo AS Store
                            INNER JOIN UserAccount AS U
                                ON U.id=Store.uid
                            INNER JOIN StoreTransaction AS ST
                                ON ST.uid=Store.uid
                            INNER JOIN UserAccount AS U1
                                ON ST.relatedId=U1.id
                            INNER JOIN TransType AS TT
                                ON ST.transTypeCode=TT.transTypeCode
                            WHERE Store.uid=? AND ST.storeId=? ${timeString}  ${transTypeString}
                        )
                        `;
            values = [ targetUser.uid, storeId];
            sqlString = mysql.format(sqlString, values);
        }
        // Case 3 : search all user managed by this agent
        else if(agentAccount && agentAccount.length > 0){

            // Validate permission
            // If account is not found, then target user is invalid
            let targetUser = managedAccounts[0].find( row => ( (row.account === agentAccount) && (row.role === 'agent')) );
            if(!targetUser) return res.json({errCode: 1, msg: '查無此用戶', data: []});

            // Get the transaction info of all user managed by this agent
            sqlString =`(
                            SELECT 
                                U1.account, U.role, 
                                ST.id AS tid, ST.transTypeCode, TT.transTypeDescription AS transType, ST.amount, ST.relatedName AS name, ST.comment, 
                                DATE_FORMAT(CONVERT_TZ(ST.createtime, 'UTC', 'Asia/Shanghai'),'%Y-%m-%d %H:%i:%s ') AS createtime
                            FROM AgentInfo AS Ag
                            INNER JOIN UserAccount AS U
                                ON U.id=Ag.uid
                            INNER JOIN StoreTransaction AS ST
                                ON ST.uid=Ag.uid
                            INNER JOIN UserAccount AS U1
                                ON ST.relatedId=U1.id
                            INNER JOIN TransType AS TT
                                ON ST.transTypeCode=TT.transTypeCode
                            WHERE Ag.uid=? AND ST.storeId=? ${timeString}  ${transTypeString}
                        )
                        `;
            values = [targetUser.uid, storeId];
            sqlString = mysql.format(sqlString, values);
        }
        // Case 4 : search all user managed by this user
        else {
            return res.json({errCode: 1, msg: '權限不足', data: []});
        }
                
    
           
            results = await sqlAsync.query(req.db, sqlString);
            results.forEach(function(row){
                if(row.amount <= 0){
                    row.expenditure = 0;
                    row.income = Math.abs(row.amount);
                    row.sum = row.amount;
                    row.amount = undefined;
                }else{
                    row.expenditure = Math.abs(row.amount);
                    row.income = 0;
                    row.sum = row.amount;
                    row.amount = undefined;
                }

            });

            return res.json({errCode: 0, msg: '請輸入查詢帳號', data: results});
            
    
        }catch(error){
            req.logger.error(`${error.message}`);
            return res.json({errCode: 2, msg: '未知錯誤', data: []});
        }
    }

    // Determine all accounts managed by this user
    // It returns an array contains all account infos managed by this user, including himself
    // Special case : all service agents manage their admin's account, they don't have wallet themselves
    // Please execute it in try catch 
    let getManagedUsers = async function(req) {
        // Prepare query
        let sqlString, values;
        if(req.user.role === 'agent'){
            sqlString =`(
                            SELECT U.id AS uid, U.account, U.name, Ag.id, U.role
                            FROM AgentInfo AS Ag
                            INNER JOIN UserAccount AS U
                                ON U.id=Ag.uid
                            WHERE Ag.id=?
                        )
                        UNION
                        (
                            SELECT U.id AS uid, U.account, U.name, Store.id, U.role
                            FROM StoreInfo AS Store
                            INNER JOIN AgentInfo AS Ag
                                ON Ag.storeId=Store.id
                            INNER JOIN UserAccount AS U
                                ON U.id=Store.uid
                            WHERE Ag.id=?
                        )
                        UNION
                        (
                            SELECT U.id AS uid, U.account, U.name, Mem.id, U.role
                            FROM MemberInfo AS Mem
                            INNER JOIN UserAccount AS U
                                ON U.id=Mem.uid
                            WHERE Mem.agentId=?
                        )
                        ;
                        (
                            SELECT U.id AS uid, U.account, U.name, Store.id, Store.currencyName, U.role
                            FROM StoreInfo AS Store
                            INNER JOIN AgentInfo AS Ag
                                ON Ag.storeId=Store.id
                            INNER JOIN UserAccount AS U
                                ON U.id=Store.uid
                            WHERE Ag.id=?
                        )
                        ;`;
            values = [req.user.roleId, req.user.roleId, req.user.roleId, req.user.roleId];
            sqlString = mysql.format(sqlString, values);
        }
        else if(req.user.role === 'store'){
            sqlString =`(
                            SELECT U.id AS uid, U.account, U.name, Store.id, U.role 
                            FROM StoreInfo AS Store
                            INNER JOIN UserAccount AS U
                                ON U.id=Store.uid
                            WHERE Store.id=?
                        )
                        UNION
                        (
                            SELECT U.id AS uid, U.account, U.name, Ag.id, U.role
                            FROM AgentInfo AS Ag
                            INNER JOIN UserAccount AS U
                                ON U.id=Ag.uid
                            WHERE Ag.storeId=?
                        )
                        UNION
                        (
                            SELECT U.id AS uid, U.account, U.name, Mem.id, U.role
                            FROM MemberInfo AS Mem
                            INNER JOIN UserAccount AS U
                                ON U.id=Mem.uid
                            INNER JOIN AgentInfo AS Ag
                                ON Ag.id=Mem.agentId
                            WHERE Ag.storeId=?
                        )
                        ;
                        (
                            SELECT U.id AS uid, U.account, U.name, Store.id, Store.currencyName, U.role 
                            FROM StoreInfo AS Store
                            INNER JOIN UserAccount AS U
                                ON U.id=Store.uid
                            WHERE Store.id=?
                        )
                        ;`;
            values = [req.user.roleId, req.user.roleId, req.user.roleId, req.user.roleId];
            sqlString = mysql.format(sqlString, values);
        }
        else if(req.user.role === 'admin'){
            sqlString =`(
                            SELECT U.id AS uid, U.account, U.name, Adm.id, U.role
                            FROM AdminInfo AS Adm
                            INNER JOIN UserAccount AS U
                                ON U.id=Adm.uid
                            WHERE Adm.id=?
                        )
                        UNION
                        (
                            SELECT U.id AS uid, U.account, U.name, Store.id, U.role
                            FROM StoreInfo AS Store
                            INNER JOIN UserAccount AS U
                                ON U.id=Store.uid
                            WHERE Store.adminId=?
                        )
                        UNION
                        (   
                            SELECT U.id AS uid, U.account, U.name, Ag.id, U.role
                            FROM AgentInfo AS Ag
                            INNER JOIN UserAccount AS U
                                ON U.id=Ag.uid
                            INNER JOIN StoreInfo AS Store
                                ON Store.id=Ag.storeId AND Store.adminId=?
                        )
                        UNION
                        (
                            SELECT U.id AS uid, U.account, U.name, Mem.id, U.role
                            FROM MemberInfo AS Mem
                            INNER JOIN UserAccount AS U
                                ON U.id=Mem.uid
                            INNER JOIN AgentInfo AS Ag
                                ON Ag.id=Mem.agentId
                            INNER JOIN StoreInfo AS Store
                                ON Store.id=Ag.storeId AND Store.adminId=?
                        )
                        ;
                        (
                            SELECT U.id AS uid, U.account, U.name, Store.id, Store.currencyName, U.role
                            FROM StoreInfo AS Store
                            INNER JOIN UserAccount AS U
                                ON U.id=Store.uid
                            WHERE Store.adminId=?
                        )
                        ;`;
            values = [req.user.roleId, req.user.roleId, req.user.roleId, req.user.roleId, req.user.roleId];
            sqlString = mysql.format(sqlString, values);
        }
        else{
            // Invalid role
            throw Error('invalid role');
        }

        // Execute query
        let results = await sqlAsync.query(req.db, sqlString);

        return results;
    }
    
    let expenditureSearchValidator = function(){
        return [
            // Check format
            // All values must be string
            body('agentAccount')
                .isString().withMessage('Wrong data format')
                .isLength({ max:20 }).withMessage('代理名稱長度不可超過 20'),
            body('storeAccount')
                .isString().withMessage('Wrong data format')
                .isLength({ max:20 }).withMessage('店家名稱長度不可超過 20'),
            body('memberAccount')
                .isString().withMessage('Wrong data format')
                .isLength({ max:20 }).withMessage('會員名稱長度不可超過 20'),
            body('currencyName')  
                .isString().withMessage('Wrong data format')
                .isLength({ max:20 }).withMessage('店家名稱長度不可超過 20')
                .custom(async function(data, {req}){
                    let sql, values, sqlString;

                    if(req.user.role === 'admin'){
                        sql = `SELECT Store.uid
                                FROM AdminInfo AS Adm
                                INNER JOIN StoreInfo AS Store
                                    ON Store.adminId=Adm.id
                                INNER JOIN UserAccount AS U
                                    ON U.id=Store.uid
                                WHERE Adm.id=? AND U.account=?
                                ;`;
                        values = [req.user.roleId, data];
                        sqlString = mysql.format(sql, values);

                    }else if(req.user.role === 'store'){
                        sql = `SELECT Store.uid
                                FROM StoreInfo AS Store
                                INNER JOIN UserAccount AS U
                                    ON U.id=Store.uid
                                WHERE Store.id=? AND U.account=?
                                ;`;
                        values = [req.user.roleId, data];
                        sqlString = mysql.format(sql, values);
                    }else if(req.user.role === 'agent') {
                        sql = `SELECT Store.uid
                                FROM AgentInfo AS Ag
                                INNER JOIN StoreInfo AS Store
                                    ON Ag.storeId=Store.id
                                INNER JOIN UserAccount AS U
                                    ON U.id=Store.uid
                                WHERE Ag.id=? AND U.account=?
                                ;`;
                        values = [req.user.roleId, data];
                        sqlString = mysql.format(sql, values);
                    }
                    else{
                        throw Error(`權限不足`);
                    }

                    
                    try {
                        let result = await sqlAsync.query(req.db, sqlString);
                        if(result.length <= 0 ) throw Error(`Cannot find the storeUid of this user role[${req.user.role}] id[${req.user.roleId}]`);
                    }
                    catch (error) {
                        req.logger.error(`${error.message}`);
                        throw Error('幣別錯誤');
                    }
                    
                    return true;
                }),
            body('transType')
                .custom(async function(data){
                    
                    if(data === undefined) return true;
                    
                    // Check if it is number
                    if(isNaN(parseInt(data))) throw Error(`轉帳類型錯誤`);

                    return true;

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
            sanitizeBody(['agentAccount', 'storeAccount', 'memberAccount'])
                .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
                .trim(), // trim white space from both end
        ];
    };
 
    module.exports = {
        expenditure : {
            render: expenditureHandler,
            search : expenditureSearchHandler,
            searchValidate : expenditureSearchValidator(),
        },
    };