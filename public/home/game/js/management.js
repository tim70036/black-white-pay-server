var dataset = [], oTable;
var Management = function () {


    var colMappings = {
        gameId: 0,
        storeId: 1,
        gameName: 2,
        provider: 3,
        gameSrc: 4,
        createtime: 5,
        delete: 6,
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
            'ajax': function(data, callback, settings){
                callback({data: dataset});
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
                    data: 'gameId'
                },
                {
                    data: 'storeId'
                },
                {
                    data: 'gameName'
                },
                {
                    data: 'provider'
                },
                {
                    data: 'gameSrc'
                },
                {
                    data: 'createtime'
                },
                {
                    "defaultContent": "<button id=\"delete\" type=\"button\" class=\"btn m-btn--pill    btn-outline-success m-btn m-btn--outline-2x \">刪除</button>"
                },
            ],

            columnDefs: [
                {
                    targets: colMappings.gameId,
                    responsivePriority: 0,
                    className: 'dt-center',
                    visible: false,
                },
                {
                    targets: colMappings.storeId,
                    responsivePriority: 1,
                    className: 'dt-center',
                    visible: false,
                },
                {
                    targets: colMappings.gameName,
                    responsivePriority: 2,
                    className: 'dt-center',
                },
                {
                    targets: colMappings.provider,
                    responsivePriority: 3,
                    className: 'dt-center',
                },
                {
                    targets: colMappings.gameSrc,
                    responsivePriority: 4,
                    className: 'dt-center',
                    render: function (data, type, full, meta) {
                        return `
                        <img src=${data} height="80" width="80">`;
                    },
                },
                {
                    targets: colMappings.createtime,
                    responsivePriority: 5,
                    className: 'dt-center',
                },
                {
                    targets: colMappings.delete,
                    responsivePriority: 6,
                    className: 'dt-center',
                },
            ],
        });

        table.on('click', '#delete', function(e){
			var _this = $(this);
			var nRow = $(this).parents('tr')[0];

			$(this).addClass('m-loader m-loader--success m-loader--right disabled')
			.attr('disabled', true);
			let row = oTable.row(nRow).data();
			let data = { 				 
                storeId: row.storeId,
                gameId: row.gameId,
			};
			
			$.ajax({
				url : '/home/game/management/delete',
				method : 'POST',
				timeout : 5000,
				data : data,
				success: function(response){
                    _this.removeClass('m-loader m-loader--success m-loader--right')
                                .attr('disabled', false);
					if(response.err){
                        swal({
                            title: '執行失敗',
                            text: response.msg,
                            type: 'error',
                            confirmButtonText: 'OK'
                        });
					}else{
						swal({
                            title: '執行成功',
                            text: response.msg,
                            type: 'success',
                            confirmButtonText: 'OK'
                        });
                        oTable.row(nRow).remove().draw();
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

    var initForm = function () {

        initSelect2();

        // Set up validator for form
        $('#create-form').validate({
            // define validation rules
            rules: {
                storeAccountModal: {
                    required: true,
                },
                gameNameModal: {
                    required: true,
                },
            },

            // custom invalid messages
            messages: {
                storeAccountModal: {
                    required: '請選擇店家',
                },
                gameNameModal: {
                    required: '請選擇遊戲',
                },
            },
            //display error alert on form submit
            invalidHandler: function (event, validator) {

                swal({
                    'title': '欄位資料錯誤',
                    'text': '請更正錯誤欄位後再試一次',
                    'type': 'error',
                    confirmButtonText: 'OK'
                });

            },

            submitHandler: function (form) {
                // Ready to send data
                // Block modal
                $('#createButton').attr('disabled', true);
                mApp.block('#create-modal .modal-content', {
                    size: 'lg',
                    type: 'loader',
                    state: 'primary',
                    message: '新增中...'
                });

                let storeId = $('#storeModal').attr("store");
                let gameId = $('#gameModal').attr("game");
                let data = {
                    storeId: storeId,
                    gameId: gameId,
                };
                $.ajax({
                    type: 'POST',
                    url: '/home/game/management/add',
                    data: data, // serializes the form, note it is different from other AJAX in this module
                    timout: 30000, // 30 sec
                    // Success
                    success: function (result) {
                        $('#createButton').attr('disabled', false);
                        mApp.unblock('#create-modal .modal-content'); // Unblock button

                        // Sweet alert
                        if (!result.err) {

                            $('#create-modal').modal('hide'); // close form modal
                            oTable.ajax.reload(); // reload table data

                            swal({
                                title: '執行成功',
                                text: '遊戲已新增!',
                                type: 'success',
                                confirmButtonText: 'OK'
                            });
                        } else {
                            swal({
                                title: '執行失敗',
                                text: result.msg,
                                type: 'error',
                                confirmButtonText: 'OK'
                            });
                        }
                    },
                    // Fail
                    error: function (xhr, textStatus, errorThrown) {
                        $('#createButton').attr('disabled', false);
                        mApp.unblock('#create-modal .modal-content'); // Unblock button

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
            }
        });

        $('#gameList-form').validate({
            // define validation rules
            rules: {
                storeAccount: {
                    required:true,
                },
            },

            // custom invalid messages
            messages: {
                storeAccount: {
                    required: '請選擇店家',
                },
            },

            // Disable show error
            showErrors: function (errorMap, errorList) {
                // Do nothing here
            },

            //display error alert on form submit  
            invalidHandler: function (event, validator) {

                let errorMessage = validator.errorList[0].message;
                for (let i = 1; i < validator.errorList.length; i++) errorMessage += ' , ' + validator.errorList[i].message;

                swal({
                    'title': '欄位資料錯誤',
                    'text': errorMessage,
                    'type': 'error',
                    confirmButtonText: 'OK'
                });

            },

            submitHandler: function (form) {
                // Ready to send data
                // Block UI
                $('#m_search').attr('disabled', true);
                mApp.block('#gameList-form', {
                    size: 'lg',
                    type: 'loader',
                    state: 'primary',
                    message: '搜尋...'
                });
                let storeId = $('#storeId').attr("store");
                let data = {
                    storeId: storeId,
                };


                $.ajax({
                    type: 'POST',
                    url: '/home/game/management/search',
                    data: data, // serializes the form, note it is different from other AJAX in this module
                    timout: 30000,
                    success: function (response) {
                        if (response.err) {

                            swal({
                                title: '執行失敗',
                                text:　response.msg,
                                type: 'error',
                                confirmButtonText: 'OK'
                            });
                        } else{
                            dataset = response.data;

                            oTable.ajax.reload();
                            
                        }
                        $('#m_search').attr('disabled', false);
                        mApp.unblock('#gameList-form'); // Unblock 
                        
                    },
                    error: function (xhr, textStatus, errorThrown) {
                        $('#m_search').attr('disabled', false);
                        mApp.unblock('#gameList-form'); // Unblock 
                        if (textStatus === 'timeout') {
                            swal({
                                title: '執行失敗',
                                text: '時間超時!',
                                type: 'error',
                                confirmButtonText: 'OK'
                            });
                        }

                    }
                });
            }
        });
    }

    function initSelect2(){
        $('#create-modal').on('shown.bs.modal', function () {
            // Set select 2 when modal show
            $('#storeAccountModal').select2({
                placeholder: '請選擇店家',
                data: storesModal,
                templateResult: function (data) {
                    return data.html
                },
                templateSelection: function (data) {
                    return data.text
                },
                escapeMarkup: function (markup) {
                    return markup;
                },
            });

            $('#gameNameModal').select2({
                placeholder: '請選擇遊戲',
                data: gamesModal,
                tags: true,
                templateResult: function (data) {
                    return data.html
                },
                templateSelection: function (data) {
                    return data.text
                },
                escapeMarkup: function (markup) {
                    return markup;
                },
            });
        });
        $('#storeAccount').select2({
            placeholder: '請選擇店家',
            data: stores,
            templateResult: function (data) {
                return data.html;
            },
            templateSelection: function (data) {
                return data.text
            },
            escapeMarkup: function (markup) {
                return markup;
            },
        });
    }


    return {
        initTable: initTable,
        initForm: initForm
    };

}();

jQuery(document).ready(function () {
    Management.initTable();
    Management.initForm();
});