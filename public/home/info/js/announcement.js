
var Announcement = function () {

    var oTable;

    var colMappings = {
        id: 0,
        title: 1,
        updatetime: 2,
        createtime: 3,
        detail: 4,
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
                url: '/home/info/announcement/read',
            },

            //== Pagination settings
            dom: `
			<'row'<'col-sm-6 text-left'f><'col-sm-6 text-right'B>>
			<'row'<'col-sm-12'tr>>
			<'row'<'col-sm-12 col-md-5'i><'col-sm-12 col-md-7 dataTables_pager'lp>>`,

            order: [
                [colMappings.updatetime, 'desc']
            ],

            headerCallback: function (thead, data, start, end, display) {
                thead.getElementsByTagName('th')[0].innerHTML = `
                    <label class="m-checkbox m-checkbox--single m-checkbox--solid m-checkbox--brand">
                        <input type="checkbox" value="" class="m-group-checkable">
                        <span></span>
                    </label>`;
            },

            // Data table button
            buttons: [{
                text: '<i class="fa fa-times"></i> <span>刪除選取</span>',
                attr: {
                    id: 'deleteButton',
                    class: 'table-btn btn btn-danger m-btn m-btn--custom m-btn--icon  m-btn--bolder ',
                },
            }, ],

            // Column data
            columns: [
                {
                    data: 'id'
                },
                {
                    data: 'title'
                },
                {
                    data: 'updatetime'
                },
                {
                    data: 'createtime'
                },
                {
                    data: null,
                    defaultContent: ''
                }, // detail
            ],

            columnDefs: [
                {
                    targets: colMappings.id,
                    responsivePriority: 0,
                    width: '30px',
                    className: 'dt-right',
                    orderable: false,
                    render: function (data, type, full, meta) {
                        return `
                        <label class="m-checkbox m-checkbox--single m-checkbox--solid m-checkbox--brand">
                            <input type="checkbox" value="" class="m-checkable">
                            <span></span>
                        </label>`;
                    },
                },
                {
                    targets: colMappings.title,
                    responsivePriority: 1,
                    className: 'dt-center',
                },
                {
                    targets: colMappings.updatetime,
                    responsivePriority: 12,
                    className: 'dt-center'
                },
                {
                    targets: colMappings.createtime,
                    responsivePriority: 20,
                    className: 'dt-center'
                },
                {
                    targets: colMappings.detail,
                    responsivePriority: 1,
                    render: detailRender,
                    className: 'dt-center'
                },
            ],
        });

        // Check row handler
        table.on('change', '.m-group-checkable', function () {
            var set = $(this).closest('table').find('td:first-child .m-checkable');
            var checked = $(this).is(':checked');

            $(set).each(function () {
                if (checked) {
                    $(this).prop('checked', true);
                    $(this).closest('tr').addClass('active');
                } else {
                    $(this).prop('checked', false);
                    $(this).closest('tr').removeClass('active');
                }
            });
        });

        // Check row handler
        table.on('change', 'tbody tr .m-checkbox', function () {
            $(this).parents('tr').toggleClass('active');
        });



        $('#deleteButton').click(function (e) {
            e.preventDefault();

            var thisButton = $(this);

            // Collect selected data
            // Iterate each row in table
            var data = [];
            oTable.rows().every(function (rowIdx, tableLoop, rowLoop) {

                // Check whether this row has been check
                var rowNode = this.node();
                var isChecked = $(rowNode).hasClass('active');

                if (isChecked) {
                    var obj = {};
                    obj['id'] = oTable.cell(rowIdx, colMappings.id).data();

                    data.push(obj);
                }
            });

            // If empty then return
            if (data.length <= 0) {
                return;
            }

            // Sweet alert, make user confirm
            swal({
                title: '確定刪除 ' + data.length + ' 項公告?',
                text: '這項變動將無法復原!',
                type: 'warning',
                showCancelButton: true,
                confirmButtonText: '確定刪除',
                cancelButtonText: '不，取消',
                reverseButtons: true
            }).then(function (result) {
                // User confirmed
                if (result.value) {

                    // Ready to send data
                    // Block button
                    thisButton.addClass('m-loader m-loader--danger m-loader--right')
                        .attr('disabled', true);

                    // Send to server
                    $.ajax({
                        type: 'POST',
                        url: '/home/info/announcement/delete',
                        data: {
                            data: data
                        },
                        timout: 5000, // 5 sec
                        // Success
                        success: function (result) {
                            console.log({
                                result
                            });

                            // Unblock button
                            thisButton.removeClass('m-loader m-loader--danger m-loader--right')
                                .attr('disabled', false);

                            // Sweet alert
                            if (!result.err) {

                                oTable.ajax.reload();

                                swal({
                                    title: '執行成功',
                                    text: '公告已刪除!',
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

                            // Unblock button
                            thisButton.removeClass('m-loader m-loader--danger m-loader--right')
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
                }
                // User did not confirmed
                // result.dismiss can be 'cancel', 'overlay',
                // 'close', and 'timer'
                else if (result.dismiss === 'cancel') {
                    // swal(
                    //     'Cancelled',
                    //     'Your imaginary file is safe :)',
                    //     'error'
                    // )
                }
            });




        });

        // Function for rendering detail
        function detailRender(data, type, row, meta) {
            return `
				<a href="/home/detail/announcement?id=${row.id}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm btn-block m-btn m-btn--icon" style="background-color: #4152d8; border-color: #4152d8;">
					<span>
						<i class="fa fa-edit"></i>
						<span>查看編輯</span>
					</span>
				</a>
			`;
        }
    };

    var initForm = function () {

        // Select 2, modal
        $('#create-modal').on('shown.bs.modal', function () {
        });

        // Form Validate
        // http://jqueryvalidation.org/validate/

        // Set up validator for form
        $('#create-form').validate({
            // define validation rules
            rules: {
                title: {
                    required: true,
                    maxlength: 40
                },
            },

            // custom invalid messages
            messages: {
                title: {
                    required: '標題爲必填欄位',
                    maxlength: '長度不可超過 40'
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

                let data = new FormData();
                let file = $('#photo').get(0).files[0];
                let title = $('#title').val();
                
                data.append('announcementImg', file);
                data.append('title', title);
                
                $.ajax({
                    type: 'POST',
                    url: '/home/info/announcement/create',
                    contentType: false,
                    processData: false,
                    data: data, // serializes the form, note it is different from other AJAX in this module
                    timout: 5000, // 5 sec
                    // Success
                    success: function (result) {

                        $('#id').val('');
                        $('#title').val('');
                        $('#image-preview').html('');
                        $('#photo').val('');
                        
                        $('#createButton').attr('disabled', false);
                        mApp.unblock('#create-modal .modal-content'); // Unblock button

                        // Sweet alert
                        if (!result.err) {

                            $('#create-modal').modal('hide'); // close form modal
                            oTable.ajax.reload(); // reload table data

                            swal({
                                title: '執行成功',
                                text: '公告已新增!',
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
    }


    return {
        initTable: initTable,
        initForm: initForm
    };

}();

jQuery(document).ready(function () {
    Announcement.initTable();
    Announcement.initForm();
    $('#photo').imageReader({
        renderType: 'canvas',
        onload: function (canvas) {
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = "orange";
            ctx.font = "12px Verdana";
            ctx.fillText("Filename : " + this.name, 10, 20, canvas.width - 10);
            $(canvas).css({
                width: '100%',
                marginBottom: '-10px'
            });
        }
    });
});