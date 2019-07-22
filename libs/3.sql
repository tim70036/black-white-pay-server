SELECT 
    AdminInfo.name AS adminName,
    AdminInfo.cash AS adminCash,
    AdminInfo.credit AS adminCredit,
    AdminBalance.totalAvail AS adminTotalAvail,
    AdminBalance.totalCash AS adminTotalCash,
    AdminBalance.totalFrozen AS adminTotalFrozen,
    
    COUNT(DISTINCT(ServiceAgentInfo.id)) AS serviceAgentNum,

    MAX(HeadAgentBalance.totalAvail) AS headAgentMaxAvail,
    MAX(HeadAgentBalance.totalCash)  AS headAgentMaxCash,
    MAX(HeadAgentBalance.totalFrozen) AS headAgentMaxFrozen,
    AdminBalance.totalNumber AS headAgentNum,
   
    MAX(AgentBalance.totalAvail) AS agentMaxAvail,
    MAX(AgentBalance.totalCash)  AS agentMaxCash,
    MAX(AgentBalance.totalFrozen) AS agentMaxFrozen,
    COUNT(DISTINCT(AgentBalance.id)) AS agentNum,

    MAX(MemberInfo.cash)  AS memberMaxCash,
    MAX(MemberInfo.credit)  AS memberMaxCredit,
    MAX(MemberInfo.frozenBalance) AS memberMaxFrozen,
    MAX(MemberInfo.availBalance) AS memberMaxAvail,
    COUNT(DISTINCT(MemberInfo.id)) AS memberNum

FROM AdminInfo
INNER JOIN ServiceAgentInfo 
    ON ServiceAgentInfo.adminId=AdminInfo.id AND ServiceAgentInfo.id=2
INNER JOIN AdminBalance
    ON AdminBalance.id=AdminInfo.id 
LEFT JOIN HeadAgentInfo
    ON HeadAgentInfo.adminId=AdminInfo.id
INNER JOIN HeadAgentBalance
	ON HeadAgentBalance.id=HeadAgentInfo.id
LEFT JOIN AgentInfo
	ON AgentInfo.headAgentId=HeadAgentInfo.id
INNER JOIN AgentBalance
	ON AgentBalance.id=AgentInfo.id
LEFT JOIN MemberInfo
    ON MemberInfo.agentId=AgentInfo.id


SELECT 
    HeadAgentInfo.name AS headAgentName,
    HeadAgentInfo.cash AS headAgentCash,
    HeadAgentInfo.credit AS headAgentCredit,
    HeadAgentBalance.totalAvail AS headAgentTotalAvail,
    HeadAgentBalance.totalCash AS headAgentTotalCash,
    HeadAgentBalance.totalFrozen AS headAgentTotalFrozen,

    MAX(AgentBalance.totalAvail) AS agentMaxAvail,
    MAX(AgentBalance.totalCash)  AS agentMaxCash,
    MAX(AgentBalance.totalFrozen) AS agentMaxFrozen,
    COUNT(DISTINCT(AgentBalance.id)) AS agentNum,

    MAX(MemberInfo.cash)  AS memberMaxCash,
    MAX(MemberInfo.credit)  AS memberMaxCredit,
    MAX(MemberInfo.frozenBalance) AS memberMaxFrozen,
    MAX(MemberInfo.availBalance) AS memberMaxAvail,
    COUNT(DISTINCT(MemberInfo.id)) AS memberNum

From HeadAgentInfo
INNER JOIN HeadAgentBalance
	ON HeadAgentBalance.id=HeadAgentInfo.id AND HeadAgentInfo.id=?
LEFT JOIN AgentInfo
	ON AgentInfo.headAgentId=HeadAgentInfo.id
INNER JOIN AgentBalance
	ON AgentBalance.id=AgentInfo.id
LEFT JOIN MemberInfo
    ON MemberInfo.agentId=AgentInfo.id


SELECT 
    AgentInfo.name AS agentName,
    AgentInfo.cash AS agentCash,
    AgentInfo.credit AS agentCredit,
    AgentBalance.totalAvail AS agentTotalAvail,
    AgentBalance.totalCash AS agentTotalCash,
    AgentBalance.totalFrozen AS agentTotalFrozen,

    MAX(MemberInfo.cash)  AS memberMaxCash,
    MAX(MemberInfo.credit)  AS memberMaxCredit,
    MAX(MemberInfo.frozenBalance) AS memberMaxFrozen,
    MAX(MemberInfo.availBalance) AS memberMaxAvail,
    COUNT(DISTINCT(MemberInfo.id)) AS memberNum

FROM AgentInfo
INNER JOIN AgentBalance
	ON AgentBalance.id=AgentInfo.id AND AgentInfo.id=?
LEFT JOIN MemberInfo
    ON MemberInfo.agentId=AgentInfo.id

SELECT 
    MemberInfo.name AS memberName,
    MemberInfo.cash AS memberCash,
    MemberInfo.credit AS memberCredit,
    MemberInfo.frozenBalance AS memberFrozen,
    MemberInfo.availBalance AS memberAvail

FROM MemberInfo
WHERE id=?

