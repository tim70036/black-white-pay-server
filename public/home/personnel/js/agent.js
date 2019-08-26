var Agent = function () {

    var oTable;

    var colMappings = {
        id: 0,
        account: 1,
        name: 2,
        gsCash: 3, 
        store: 4,
        bindingCode: 5,
        cash: 6,
        credit: 7,
        totalCash: 8,
        totalAvail: 9,
        rtp: 10,
        status: 11,
        comment: 12,
        email: 13,
        phoneNumber: 14,
        updatetime: 15,
        createtime: 16,
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
                url: '/home/personnel/agent/read',
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

            // Data table button, get it from view
            buttons: tableButtons,

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
                    data: 'gsCash'
                },
                {
                    data: 'store'
                },
                {
                    data: 'bindingCode'
                },
                {
                    data: 'cash'
                },
                {
                    data: 'credit'
                },
                {
                    data: 'totalCash'
                },
                {
                    data: 'totalAvail'
                },
                {
                    data: 'rtp'
                },
                {
                    data: 'status'
                },
                {
                    data: 'comment'
                },
                {
                    data: 'email'
                },
                {
                    data: 'phoneNumber'
                },
                {
                    data: 'updatetime'
                },
                {
                    data: 'createtime'
                }
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
                    targets: colMappings.account,
                    responsivePriority: 1,
                    className: 'dt-center'
                },
                {
                    targets: colMappings.name,
                    responsivePriority: 2,
                    width: '100px',
                    className: 'dt-center'
                },
                {
                    targets: colMappings.gsCash,
                    responsivePriority: 3,
                    width: '100px',
                    className: 'dt-center'
                },
                {
                    targets: colMappings.store,
                    responsivePriority: 4,
                    width: '100px',
                    className: 'dt-center'
                },
                {
                    targets: colMappings.bindingCode,
                    responsivePriority: 5,
                    width: '100px',
                    className: 'dt-center'
                },
                {
                    targets: colMappings.cash,
                    responsivePriority: 6,
                    render: numberRender,
                    className: 'dt-right'
                },
                {
                    targets: colMappings.credit,
                    responsivePriority: 7,
                    render: numberRender,
                    className: 'dt-right'
                },
                {
                    targets: colMappings.totalCash,
                    responsivePriority: 8,
                    render: numberRender,
                    className: 'dt-right'
                },
                {
                    targets: colMappings.totalAvail,
                    responsivePriority: 9,
                    render: numberRender,
                    className: 'dt-right'
                },
                {
                    targets: colMappings.rtp,
                    responsivePriority: 10,
                    render: numberRender,
                    className: 'dt-right'
                },
                {
                    targets: colMappings.status,
                    responsivePriority: 11,
                    render: statusRender,
                    className: 'dt-center'
                },
                {
                    targets: colMappings.comment,
                    responsivePriority: 12,
                },
                {
                    targets: colMappings.email,
                    responsivePriority: 13,
                },
                {
                    targets: colMappings.phoneNumber,
                    responsivePriority: 14,
                },
                {
                    targets: colMappings.updatetime,
                    responsivePriority: 15,
                },
                {
                    targets: colMappings.createtime,
                    responsivePriority: 16,
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


        $('#editButton').click(function (e) {
            e.preventDefault();

            // Change selected rows from origin format -> input field
            // Iterate each row in table
            var empty = true;
            oTable.rows().every(function (rowIdx, tableLoop, rowLoop) {

                // Check whether this row has been check
                var rowNode = this.node();
                var isChecked = $(rowNode).hasClass('active');

                if (isChecked) {
                    empty = false;
                    var name = oTable.cell(rowIdx, colMappings.name).data();
                    var credit = oTable.cell(rowIdx, colMappings.credit).data();
                    var phoneNumber = oTable.cell(rowIdx, colMappings.phoneNumber).data();
                    var email = oTable.cell(rowIdx, colMappings.email).data();
                    var comment = oTable.cell(rowIdx, colMappings.comment).data();
                    var rtp = oTable.cell(rowIdx, colMappings.rtp).data();

                    //console.log('index is cheched : ' + rowIdx);
                    oTable.cell(rowIdx, colMappings.name).node().innerHTML = `<input type="text" class="form-control input-small" value=${name}>`;
                    oTable.cell(rowIdx, colMappings.credit).node().innerHTML = `<input type="text" class="form-control input-small" value=${credit}>`;
                    oTable.cell(rowIdx, colMappings.phoneNumber).node().innerHTML = `<input type="text" class="form-control input-small" value=${phoneNumber}>`;
                    oTable.cell(rowIdx, colMappings.email).node().innerHTML = `<input type="text" class="form-control input-small" value=${email}>`;
                    oTable.cell(rowIdx, colMappings.comment).node().innerHTML = `<input type="text" class="form-control input-small" value=${comment}>`;
                    oTable.cell(rowIdx, colMappings.rtp).node().innerHTML = `<input type="text" class="form-control input-small" value=${rtp}>`;
                }
            });

            // If empty then return
            if (empty) {
                return;
            }

            // Change button mode
            editModeButton();
        });

        $('#cancelButton').click(function (e) {
            e.preventDefault();

            // Restore rows from input field -> origin format
            // Iterate each row in table
            oTable.rows().every(function (rowIdx, tableLoop, rowLoop) {

                // Check whether this row has been check
                var rowNode = this.node();
                var isChecked = $(rowNode).hasClass('active');

                if (isChecked) {

                    var name = oTable.cell(rowIdx, colMappings.name).data();
                    var credit = oTable.cell(rowIdx, colMappings.credit).data();
                    var phoneNumber = oTable.cell(rowIdx, colMappings.phoneNumber).data();
                    var email = oTable.cell(rowIdx, colMappings.email).data();
                    var comment = oTable.cell(rowIdx, colMappings.comment).data();
                    var rtp = oTable.cell(rowIdx, colMappings.rtp).data();

                    //console.log('index is restored : ' + rowIdx);
                    oTable.cell(rowIdx, colMappings.name).node().innerHTML = name;
                    oTable.cell(rowIdx, colMappings.credit).node().innerHTML = credit;
                    oTable.cell(rowIdx, colMappings.phoneNumber).node().innerHTML = phoneNumber;
                    oTable.cell(rowIdx, colMappings.email).node().innerHTML = email;
                    oTable.cell(rowIdx, colMappings.comment).node().innerHTML = comment;
                    oTable.cell(rowIdx, colMappings.rtp).node().innerHTML = rtp;
                }
            });

            // Change button mode
            normalModeButton();
        });

        $('#saveButton').click(function (e) {
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
                    obj['name'] = oTable.cell(rowIdx, colMappings.name).node().childNodes[0].value;
                    obj['credit'] = oTable.cell(rowIdx, colMappings.credit).node().childNodes[0].value;
                    obj['phoneNumber'] = oTable.cell(rowIdx, colMappings.phoneNumber).node().childNodes[0].value;
                    obj['email'] = oTable.cell(rowIdx, colMappings.email).node().childNodes[0].value;
                    obj['comment'] = oTable.cell(rowIdx, colMappings.comment).node().childNodes[0].value;
                    obj['rtp'] = oTable.cell(rowIdx, colMappings.rtp).node().childNodes[0].value;

                    data.push(obj);
                }
            });

            // If empty then return
            if (data.length <= 0) return;

            // Sweet alert, make user confirm
            swal({
                title: '確定保存變更?',
                text: '這項變動將無法復原!',
                type: 'warning',
                showCancelButton: true,
                confirmButtonText: '確定變更',
                cancelButtonText: '不，取消',
                reverseButtons: true
            }).then(function (result) {
                // User confirmed
                if (result.value) {

                    // Ready to send data
                    // Block button
                    thisButton.addClass('m-loader m-loader--success m-loader--right')
                        .attr('disabled', true);

                    // Send to server
                    $.ajax({
                        type: 'POST',
                        url: '/home/personnel/agent/update',
                        data: {
                            data: data
                        },
                        timout: 30000, // 30 sec
                        // Success
                        success: function (result) {
                            console.log({
                                result
                            });

                            // Unblock button
                            thisButton.removeClass('m-loader m-loader--success m-loader--right')
                                .attr('disabled', false);

                            // Sweet alert
                            if (!result.err) {

                                // Succeed then reload
                                oTable.ajax.reload();
                                normalModeButton(); // Change button mode

                                swal({
                                    title: '執行成功',
                                    text: '變更已保存!',
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
                            thisButton.removeClass('m-loader m-loader--success m-loader--right')
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
                title: '確定刪除 ' + data.length + ' 位代理商?',
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
                        url: '/home/personnel/agent/delete',
                        data: {
                            data: data
                        },
                        timout: 30000, // 30 sec
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
                                    text: '代理商已刪除!',
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

        function editModeButton() {
            oTable.column(colMappings.id).visible(false);
            oTable.column(colMappings.cash).visible(false);
            oTable.column(colMappings.totalCash).visible(false);
            oTable.column(colMappings.totalAvail).visible(false);
            oTable.column(colMappings.store).visible(false);
            oTable.column(colMappings.status).visible(false);
            oTable.column(colMappings.updatetime).visible(false);
            oTable.column(colMappings.createtime).visible(false);
            $('#saveButton').css('display', 'inline');
            $('#cancelButton').css('display', 'inline');


            $('#editButton').css('display', 'none');
            $('#frozenButton').css('display', 'none');
            $('#deleteButton').css('display', 'none');
            $('#createFormButton').css('display', 'none');

        }

        function normalModeButton() {
            $('#editButton').css('display', 'inline');
            $('#frozenButton').css('display', 'inline');
            $('#deleteButton').css('display', 'inline');
            $('#createFormButton').css('display', 'inline');

            $('#saveButton').css('display', 'none');
            $('#cancelButton').css('display', 'none');
            oTable.column(colMappings.id).visible(true);
            oTable.column(colMappings.cash).visible(true);
            oTable.column(colMappings.totalCash).visible(true);
            oTable.column(colMappings.totalAvail).visible(true);
            oTable.column(colMappings.store).visible(true);
            oTable.column(colMappings.status).visible(true);
            oTable.column(colMappings.updatetime).visible(true);
            oTable.column(colMappings.createtime).visible(true);
        }
        // Function for rendering number colorful
        function numberRender(data, type, full, meta) {
            if (typeof data !== 'number') {
                return data;
            }
            if (data <= 0) {
                return '<span class="m--font-bold m--font-danger">' + data + '</span>';
            } else {
                return '<span class="m--font-bold m--font-info">' + data + '</span>';
            }
        }
        // Function for rendering status colorful
        function statusRender(data, type, full, meta) {
            var map = {
                'active': {
                    'state': 'success',
                    'title': '正常'
                },
                'frozen': {
                    'state': 'danger',
                    'title': '凍結'
                },
                'undefined': {
                    'state': 'metal',
                    'title': '不明'
                },
            };
            if (typeof map[data] === 'undefined') {
                return data;
            }
            return '<span class="m-badge m-badge--' + map[data].state + ' m-badge--dot"></span>&nbsp;' +
                '<span class="m--font-bold m--font-' + map[data].state + '">' + map[data].title + '</span>';
        }
    };

    var initForm = function () {

        // Select 2, modal
        $('#create-modal').on('shown.bs.modal', function () {
            // Set select 2 when modal show
            $('#stores').select2({
                placeholder: '請選擇歸屬的店家',
                data: stores,
                templateResult: function (data) {
                    return data.html;
                },
                templateSelection: function (data) {
                    return data.text;
                },
                escapeMarkup: function (markup) {
                    return markup;
                },
            });
        });

        // Form Validate
        // http://jqueryvalidation.org/validate/
        // Custom email validator, the original one is like shit(cannot allow blank)
        $.validator.methods.email = function (value, element) {
            return this.optional(element) || /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/.test(value);
        }

        // Custom alphaNumeric validator
        $.validator.methods.alphaNumeric = function (value, element) {
            return this.optional(element) || /^[a-z0-9]+$/i.test(value);
        }

        // Custom float validator
        $.validator.methods.float = function (value, element) {
            return this.optional(element) || $.isNumeric(value);
        }

        // Set up validator for form
        $('#create-form').validate({
            // define validation rules
            rules: {
                name: {
                    required: true,
                    maxlength: 20
                },
                account: {
                    required: true,
                    maxlength: 20,
                    alphaNumeric: true,
                },
                password: {
                    required: true,
                    minlength: 8,
                    maxlength: 20,
                    alphaNumeric: true,
                },
                passwordConfirm: {
                    required: true,
                    equalTo: '#password',
                    minlength: 8,
                    maxlength: 20,
                    alphaNumeric: true,
                },
                transPwd: {
                    required: true,
                    minlength: 6,
                    maxlength: 6,
                    digits: true,
                },
                transPwdConfirm: {
                    required: true,
                    equalTo: '#transPwd',
                    minlength: 6,
                    maxlength: 6,
                    digits: true,
                },
                currencyName: {
                    required: true,
                    maxlength: 5,
                },
                storeAccount: {
                    required: true,
                    maxlength: 20,
                    alphaNumeric: true,
                },
                bindingCode: {
                    required: true,
                    minlength: 6,
                    maxlength: 6,
                    digits: true,
                },
                
                cash: {
                    number: true
                },
                credit: {
                    number: true
                },
                rtp: {
                    min: 0,
                    max: 100,
                    number: true
                },
                email: {
                    email: true,
                    maxlength: 40
                },
                phoneNumber: {
                    digits: true,
                    maxlength: 20
                },
                comment: {
                    maxlength: 40
                },
            },

            // custom invalid messages
            messages: {
                name: {
                    required: '名稱爲必填欄位',
                    maxlength: '長度不可超過 20'
                },
                account: {
                    required: '帳號爲必填欄位',
                    maxlength: '長度不可超過 20',
                    alphaNumeric: '必須是數字或英文字母',
                },
                password: {
                    required: '密碼爲必填欄位',
                    minlength: '密碼長度至少為8',
                    maxlength: '密碼長度不可超過20',
                    alphaNumeric: '必須是數字或英文字母',
                },
                passwordConfirm: {
                    required: '確認密碼爲必填欄位',
                    equalTo: '請輸入相同的密碼',
                    minlength: '密碼長度至少為8',
                    maxlength: '密碼長度不可超過20',
                    alphaNumeric: '必須是數字或英文字母',
                },
                transPwd: {
                    required: '交易密碼爲必填欄位',
                    minlength: '交易密碼需為六位數',
                    maxlength: '交易密碼需為六位數',
                    digits: '必須是數字',
                },
                transPwdConfirm: {
                    required: '確認交易密碼爲必填欄位',
                    equalTo: '請輸入相同的交易密碼',
                    minlength: '交易密碼需為六位數',
                    maxlength: '交易密碼需為六位數',
                    digits: '必須是數字',
                },
                currencyName: {
                    required: '貨幣名稱為必填欄位',
                    maxlength: '長度不可超過 5',
                },
                storeAccount: {
                    required: '店家爲必填欄位',
                    maxlength: '長度不可超過 20',
                    alphaNumeric: '必須是數字或英文字母',
                },
                bindingCode: {
                    required: '確認綁定號碼爲必填欄位',
                    minlength: '必須是六位數',
                    maxlength: '必須是六位數',
                    digits: '必須是數字',
                },
                cash: {
                    number: '必須是整數'
                },
                credit: {
                    number: '必須是整數'
                },
                rtp: {
                    min: '必須大於0',
                    max: '必須小於100',
                    number: '必須是整數'
                },
                
                phoneNumber: {
                    digits: '必須是數字',
                    maxlength: '長度不可超過 20'
                },
                email: {
                    email: '請輸入正確的 email 格式',
                    maxlength: '長度不可超過 40'
                },
                comment: {
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
                console.log($(form).serialize());
                $.ajax({
                    type: 'POST',
                    url: '/home/personnel/agent/create',
                    data: $(form).serialize(), // serializes the form, note it is different from other AJAX in this module
                    timout: 30000, // 30 sec
                    // Success
                    success: function (result) {
                        console.log(result);
                        $('#createButton').attr('disabled', false);
                        mApp.unblock('#create-modal .modal-content'); // Unblock button

                        // Sweet alert
                        if (!result.err) {

                            $('#create-modal').modal('hide'); // close form modal
                            oTable.ajax.reload(); // reload table data

                            swal({
                                title: '執行成功',
                                text: '代理商已新增!',
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
    Agent.initTable();
    Agent.initForm();
});