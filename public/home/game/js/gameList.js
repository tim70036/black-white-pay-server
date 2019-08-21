var GameList = function () {

    var oTable;

    var colMappings = {
        gameName: 0,
        gameSrc: 1,
        createtime: 2,
    };

    // Data table init function
    var initTable = function () {
        var table = $('#data-table');

        // Init data table
        oTable = table.DataTable({

            responsive: true,
            searchDelay: 500,
            lengthMenu: [10, 25, 50],

            // Data source
            ajax: {
                url: '/home/game/gameList/read',
            },

            //== Pagination settings
            dom: `
			<'row'<'col-sm-6 text-left'f><'col-sm-6 text-right'>>
			<'row'<'col-sm-12'tr>>
			<'row'<'col-sm-12 col-md-5'i><'col-sm-12 col-md-7 dataTables_pager'lp>>`,

            order: [
                [colMappings.createtime, 'desc']
            ],

            // Column data
            columns: [
                {
                    data: 'gameName'
                },
                {
                    data: 'gameSrc'
                },
                {
                    data: 'createtime'
                },
            ],

            columnDefs: [
                {
                    targets: colMappings.gameName,
                    responsivePriority: 1,
                    className: 'dt-center',
                },
                {
                    targets: colMappings.gameSrc,
                    responsivePriority: 1,
                    className: 'dt-center',
                    render: function (data, type, full, meta) {
                        return `
                        <img src=${data} height="80" width="80">`;
                    },
                },
                {
                    targets: colMappings.createtime,
                    responsivePriority: 2,
                    width: '100px',
                    className: 'dt-center'
                },
            ],
        });
    };

    


    return {
        initTable: initTable,
    };

}();

jQuery(document).ready(function () {
    GameList.initTable();
});