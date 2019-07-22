CREATE 
    ALGORITHM = UNDEFINED 
    DEFINER = `root`@`%` 
    SQL SECURITY DEFINER
VIEW `AgentBalance` AS
    SELECT 
        `A`.`id` AS `id`,
        `A`.`headAgentId` AS `headAgentId`,
        ((IFNULL(SUM(`M`.`cash`), 0) + `A`.`cash`) + `A`.`credit`) AS `totalAvail`,
        (IFNULL(SUM(`M`.`cash`), 0) + `A`.`cash`) AS `totalCash`,
        IFNULL(SUM(`M`.`frozenBalance`), 0) AS `totalFrozen`,
        IFNULL(COUNT(`M`.`id`), 0) AS `totalNumber`
    FROM
        (`AgentInfo` `A`
        LEFT JOIN `MemberInfo` `M` ON ((`M`.`agentId` = `A`.`id`)))
    GROUP BY `A`.`id`


CREATE 
    ALGORITHM = UNDEFINED 
    DEFINER = `root`@`%` 
    SQL SECURITY DEFINER
VIEW `HeadAgentBalance` AS
    SELECT 
        `H`.`id` AS `id`,
        `H`.`adminId` AS `adminId`,
        ((IFNULL(SUM(`A`.`totalCash`), 0) + `H`.`cash`) + `H`.`credit`) AS `totalAvail`,
        (IFNULL(SUM(`A`.`totalCash`), 0) + `H`.`cash`) AS `totalCash`,
        IFNULL(SUM(`A`.`totalFrozen`), 0) AS `totalFrozen`,
        IFNULL(COUNT(`A`.`id`), 0) AS `totalNumber`
    FROM
        (`HeadAgentInfo` `H`
        LEFT JOIN `AgentBalance` `A` ON ((`A`.`headAgentId` = `H`.`id`)))
    GROUP BY `H`.`id`

CREATE 
    ALGORITHM = UNDEFINED 
    DEFINER = `root`@`%` 
    SQL SECURITY DEFINER
VIEW `AdminBalance` AS
    SELECT 
        `Adm`.`id` AS `id`,
        ((IFNULL(SUM(`H`.`totalCash`), 0) + `Adm`.`cash`) + `Adm`.`credit`) AS `totalAvail`,
        (IFNULL(SUM(`H`.`totalCash`), 0) + `Adm`.`cash`) AS `totalCash`,
        IFNULL(SUM(`H`.`totalFrozen`), 0) AS `totalFrozen`,
        IFNULL(COUNT(`H`.`id`), 0) AS `totalNumber`
    FROM
        (`AdminInfo` `Adm`
        LEFT JOIN `HeadAgentBalance` `H` ON ((`H`.`adminId` = `Adm`.`id`)))
    GROUP BY `Adm`.`id`


CREATE DEFINER=`root`@`%` PROCEDURE `Defrozen`(finalBill INT, buyinStack INT, remainStack INT, m_id INT, d_id INT)
BEGIN
	DECLARE m_frozen INT;
    DECLARE d_frozen INT;
    SELECT frozenBalance INTO m_frozen FROM MemberInfo WHERE id=m_id;
    SELECT frozenBalance INTO d_frozen FROM DpqAccount WHERE id=d_id;
    
    IF m_frozen < buyinStack THEN
		IF finalBill > 0 THEN
			UPDATE MemberInfo SET cash=cash+finalBill+buyinStack, frozenBalance=0 WHERE id=m_id;
		ELSE
			UPDATE MemberInfo SET cash=cash+remainStack, frozenBalance=0 WHERE id=m_id;
        END IF;
    ELSE
		IF finalBill > 0 THEN
			UPDATE MemberInfo SET cash=cash+finalBill+buyinStack, frozenBalance=frozenBalance-buyinStack WHERE id=m_id;
		ELSE
			UPDATE MemberInfo SET cash=cash+remainStack, frozenBalance=frozenBalance-buyinStack WHERE id=m_id;
        END IF;
    END IF;
    
    IF d_frozen <buyinStack THEN
		UPDATE DpqAccount SET profit=profit+finalBill, frozenBalance=0 WHERE id=d_id;
    ELSE
		UPDATE DpqAccount SET profit=profit+finalBill, frozenBalance=frozenBalance-buyinStack WHERE id=d_id;
    END IF;
END