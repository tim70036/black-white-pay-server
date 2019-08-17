
var Verify = function () {

    var oTable;
    var colMappings = {
        id: 0,
        account: 1,
        name: 2,
        storeName: 3,
        agentName: 4,
        accept: 5,
        deny: 6,
        createtime: 7,
    };

    // Data table init function
    var initTable = function () {
        var table = $('#data-table');

        // Init data table
        oTable = table.DataTable({

            responsive: true,
            searchDelay: 500,
            lengthMenu: [10, 25, 50],

            ajax: {
                url: '/home/personnel/verify/read',
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
                    data: 'id'
                },
                {
                    data: 'account'
                },
                {
                    data: 'name'
                },
                {
                    data: 'storeName'
                },
                {
                    data: 'agentName'
                },
                {
                    "defaultContent": "<button id=\"accept\" type=\"button\" class=\"btn m-btn--pill    btn-outline-success m-btn m-btn--outline-2x \">同意</button>"
                },
                {
                    "defaultContent": "<button id=\"deny\" type=\"button\" class=\"btn m-btn--pill    btn-outline-success m-btn m-btn--outline-2x \">拒绝</button>"
                },
                {
                    data: 'createtime'
                },
            ],

            columnDefs: [
                {
                    targets: colMappings.id,
                    responsivePriority: 0,
                    visible: false,
                    width: '30px',
                    className: 'dt-right',
                    orderable: false,
                },
                {
                    targets: colMappings.account,
                    responsivePriority: 1,
                    className: 'dt-center',
                    width: '100px',
                },
                {
                    targets: colMappings.name,
                    responsivePriority: 2,
                    className: 'dt-center',
                    width: '100px',
                },
                {
                    targets: colMappings.storeName,
                    responsivePriority: 3,
                    className: 'dt-center',
                    width: '100px',
                },
                {
                    targets: colMappings.agentName,
                    responsivePriority: 4,
                    className: 'dt-center',
                    width: '100px',
                },
                {
                    responsivePriority: 5,
                    className: 'dt-center',
                    width: '100px',
                },

                {
                    responsivePriority: 6,
                    className: 'dt-center',
                },
                {
                    targets: colMappings.createtime,
                    responsivePriority: 7,
                    className: 'dt-center',
                },
            ],
        });

        table.on('click', '#accept', function(e){
			var _this = $(this);
			var nRow = $(this).parents('tr')[0];

			$(this).addClass('m-loader m-loader--success m-loader--right disabled')
			.attr('disabled', true);

            let row = oTable.row(nRow).data();
			let data = { 				 
				id: row.id,
            };
            
			$.ajax({
				url : '/home/personnel/verify/accept',
				method : 'POST',
				timeout : 5000,
				data : data,
				success: function(response){
                    _this.removeClass('m-loader m-loader--success m-loader--right')
                                .attr('disabled', false);
					if(response.errCode == 0){
                        swal({
                            title: '執行成功',
                            text: response.msg,
                            type: 'success',
                            confirmButtonText: 'OK'
                        });
                        oTable.row(nRow).remove().draw();
					}else{
						swal({
                            title: '執行失敗',
                            text: response.msg,
                            type: 'error',
                            confirmButtonText: 'OK'
                        });
					}
				},
				error: function(xhr, textStatus, errorThrown){
					_this.removeClass('m-loader m-loader--success m-loader--right disabled')
						.attr('disabled', false);
                    if (textStatus === 'timeout') {
                        swal({
                            title: '執行失敗',
                            text: '執行超時',
                            type: 'error',
                            confirmButtonText: 'OK'
                        });
                    } else {
                        swal({
                            title: '執行失敗',
                            text: '執行失敗',
                            type: 'error',
                            confirmButtonText: 'OK'
                        });
                    }
				 }

			});
		});

		table.on('click', '#deny', function(e){
			var _this = $(this);
			var nRow = $(this).parents('tr')[0];

			$(this).addClass('m-loader m-loader--success m-loader--right disabled')
			.attr('disabled', true);
			let row = oTable.row(nRow).data();
			let data = { 				 
				id: row.id
			};
			
			$.ajax({
				url : '/home/personnel/verify/deny',
				method : 'POST',
				timeout : 5000,
				data : data,
				success: function(response){
                    _this.removeClass('m-loader m-loader--success m-loader--right')
                                .attr('disabled', false);
					if(response.errCode == 0){
                        swal({
                            title: '執行成功',
                            text: response.msg,
                            type: 'success',
                            confirmButtonText: 'OK'
                        });
                        oTable.row(nRow).remove().draw();
					}else{
						swal({
                            title: '執行失敗',
                            text: response.msg,
                            type: 'error',
                            confirmButtonText: 'OK'
                        });
					}
				},
				error: function(xhr, textStatus, errorThrown){
					_this.removeClass('m-loader m-loader--success m-loader--right disabled')
						.attr('disabled', false);
                    if (textStatus === 'timeout') {
                        swal({
                            title: '執行失敗',
                            text: '執行超時',
                            type: 'error',
                            confirmButtonText: 'OK'
                        });
                    } else {
                        swal({
                            title: '執行失敗',
                            text: '執行失敗',
                            type: 'error',
                            confirmButtonText: 'OK'
                        });
                    }
				 }

			});
		});
    };

    return {
        initTable: initTable,
    };
}();

jQuery(document).ready(function () {
    Verify.initTable();
});