UPDATE DpqAccount  SET profit=0, frozenBalance=0;
UPDATE MemberInfo  SET cash=0, frozenBalance=0;
UPDATE HeadAgentInfo  SET cash=0;
UPDATE AgentInfo  SET cash=0;
UPDATE AdminInfo  SET cash=10000000;
TRUNCATE Transaction;
TRUNCATE GameVerify;
TRUNCATE GameFrozen;
TRUNCATE HistoryGameDetail;


DELETE FROM HistoryGameList;
ALTER TABLE HistoryGameList AUTO_INCREMENT = 1;
