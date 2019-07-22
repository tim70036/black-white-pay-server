
function roleToTable(role) {
    const mappings = {
		'admin': 'AdminInfo',
		'store': 'StoreInfo',
		'agent': 'AgentInfo',
		'member': 'MemberInfo',
	};
    return mappings[role];
}

module.exports = {
    roleToTable,
};