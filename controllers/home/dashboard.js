const
    mysql = require('mysql'),
    sqlAsync = require('../../libs/sqlAsync');

// Handler for home page
let renderHandler = async function(req,res) {
    
    // View render path based on role
    let pagePath = pathStrings[req.user.role];

    // Info query
    let sqlStringInfo, values;
    sqlStringInfo = sqlStrings[req.user.role];
    values = [req.user.roleId];
    sqlStringInfo = mysql.format(sqlStringInfo, values);

    let userInfo, results;
    try {

        // Get info data
        results = await sqlAsync.query(req.db, sqlStringInfo);

        // Check result
        if(results.length <= 0 ) throw Error(`cannot find info of role[${req.user.role}] , roleId[${req.user.roleId}]`);
        userInfo = results[0];
        
        // Calculate chart value
        let cash, credit, totalCash, totalAvail;
        if(req.user.role === 'admin'){
            cash = userInfo.adminCash;
            credit = userInfo.adminCredit;
            totalCash = userInfo.adminTotalCash;
            totalAvail = userInfo.adminTotalAvail;
        }
        else if(req.user.role === 'store'){
            cash = userInfo.storeCash;
            credit = userInfo.storeCredit;
            totalCash = userInfo.storeTotalCash;
            totalAvail = userInfo.storeTotalAvail;
        }
        else if(req.user.role === 'agent'){
            cash = userInfo.agentCash;
            credit = userInfo.agentCredit;
            totalCash = userInfo.agentTotalCash;
            totalAvail = userInfo.agentTotalAvail;
        }
        else{
            throw Error(`invalid Role`);
        }

        // General case
        // Calculate chart value, totalAvail & cash & belowTotalCash & remainCredit
        userInfo.totalAvail = totalAvail;
        userInfo.cash = cash;
        userInfo.belowTotalCash = totalCash - cash;

        userInfo.remainCredit = credit;
        if(cash < 0) userInfo.remainCredit += cash;
        if(userInfo.belowTotalCash < 0)  userInfo.remainCredit += userInfo.belowTotalCash;
        if(userInfo.remainCredit < 0) userInfo.remainCredit = 0;
        
    } catch (error) {
        req.logger.error(`${error.message}`);
        return res.render(pagePath, {layout : 'home'});
    }
    return res.render(pagePath, {layout : 'home', userInfo: userInfo});
};

let pathStrings = {
    admin : `home/indexAdmin`,
    store : `home/indexStore`,
    agent : `home/indexAgent`,
};

let sqlStrings = {

    admin : `
    SELECT 
        U.GSCash AS GSCash,
        Adm.cash AS adminCash,
        Adm.credit AS adminCredit,
        AdmB.totalAvail AS adminTotalAvail,
        AdmB.totalCash AS adminTotalCash,
    
        MAX(SB.totalAvail) AS storeMaxAvail,
        MAX(SB.totalCash)  AS storeMaxCash,
        SB.totalNumber AS storeNum,
       
        MAX(AB.totalAvail) AS agentMaxAvail,
        MAX(AB.totalCash)  AS agentMaxCash,
        COUNT(DISTINCT(AB.id)) AS agentNum,
    
        MAX(Mem.cash)  AS memberMaxCash,
        MAX(Mem.credit)  AS memberMaxCredit,
        MAX(Mem.availBalance) AS memberMaxAvail,
        COUNT(DISTINCT(Mem.id)) AS memberNum
    
    FROM AdminInfo AS Adm
    LEFT JOIN UserAccount AS U
        ON Adm.uid=U.id
    LEFT JOIN AdminBalance AS AdmB
        ON AdmB.id=Adm.id 
    LEFT JOIN StoreInfo AS Store
        ON Store.adminId=Adm.id
    LEFT JOIN StoreBalance AS SB
        ON SB.id=Store.id
    LEFT JOIN AgentInfo AS Ag
        ON Ag.storeId=Store.id
    LEFT JOIN AgentBalance AS AB
        ON AB.id=Ag.id
    LEFT JOIN MemberInfo AS Mem
        ON Mem.agentId=Ag.id
    WHERE Adm.id=?
    ;`,

    store: `
    SELECT 
        U.GSCash AS GSCash,
        Store.cash AS storeCash,
        Store.credit AS storeCredit,
        SB.totalAvail AS storeTotalAvail,
        SB.totalCash AS storeTotalCash,
    
        MAX(AB.totalAvail) AS agentMaxAvail,
        MAX(AB.totalCash)  AS agentMaxCash,
        COUNT(DISTINCT(AB.id)) AS agentNum,
    
        MAX(Mem.cash)  AS memberMaxCash,
        MAX(Mem.credit)  AS memberMaxCredit,
        MAX(Mem.availBalance) AS memberMaxAvail,
        COUNT(DISTINCT(Mem.id)) AS memberNum
    
    From StoreInfo AS Store
    LEFT JOIN UserAccount AS U
        ON Store.uid=U.id
    LEFT JOIN StoreBalance AS SB
        ON SB.id=Store.id
    LEFT JOIN AgentInfo AS Ag
        ON Ag.storeId=Store.id
    LEFT JOIN AgentBalance AS AB
        ON AB.id=Ag.id
    LEFT JOIN MemberInfo AS Mem
        ON Mem.agentId=Ag.id
    WHERE Store.id=?
    ;`,

    agent:`
    SELECT 
        U.GSCash AS GSCash,
        AgentInfo.cash AS agentCash,
        AgentInfo.credit AS agentCredit,
        AB.totalAvail AS agentTotalAvail,
        AB.totalCash AS agentTotalCash,
    
        MAX(Mem.cash)  AS memberMaxCash,
        MAX(Mem.credit)  AS memberMaxCredit,
        MAX(Mem.availBalance) AS memberMaxAvail,
        COUNT(DISTINCT(Mem.id)) AS memberNum
    
    FROM AgentInfo
    LEFT JOIN UserAccount AS U
        ON AgentInfo.uid=U.id
    LEFT JOIN AgentBalance AS AB
        ON AB.id=AgentInfo.id 
    LEFT JOIN MemberInfo AS Mem
        ON Mem.agentId=AgentInfo.id
    WHERE AgentInfo.id=?
    ;`,

};

module.exports = {
    render      : renderHandler,
};