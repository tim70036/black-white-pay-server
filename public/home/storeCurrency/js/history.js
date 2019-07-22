var footer = [];
var History = function () {

	var oTable, dataset = [];

	var colMappings = {
		tid: 0,
		account: 1,
		name: 2,
		transTypeCode: 3,
		transCurrency: 4,
		amount: 5,
		relatedName: 6,
		comment: 7,
		createtime: 8,
	};

	// Data table init function
	var initTable = function () {
		var table = $('#data-table');

		// Init data table
		oTable = table.DataTable({

			responsive: true,
			searchDelay: 500,

			// Data source
			ajax: function (data, callback, settings) {
				callback({ data: dataset });
			},

			//== Pagination settings
			dom: `
			<'row'<'col-sm-6 text-left'><'col-sm-6 text-right'f>>
			<'row'<'col-sm-12'tr>>
			<'row'<'col-sm-12 col-md-5'i><'col-sm-12 col-md-7 dataTables_pager'lp>>`,

			order: [[colMappings.createtime, 'desc']],

			// Data table button
			buttons: [
			],

			// Column data
			columns: [
				{ data: 'tid' },
				{ data: 'account' },
				{ data: 'name' },
				{ data: 'transTypeCode' },
				{ data: 'currencyName'},
				{ data: 'amount' },
				{ data: 'relatedName' },
				{ data: 'comment' },
				{ data: 'createtime' }
			],

			columnDefs: [
				{
					targets: colMappings.tid,
					visible: false,
					searchable: false,
				},
				{ targets: colMappings.account, responsivePriority: 1, class: 'dt-center' },
				{ targets: colMappings.name, responsivePriority: 2, class: 'dt-center', width: '100px', },
				{ targets: colMappings.transTypeCode, responsivePriority: 3, class: 'dt-center', render: transTypeColor },
				{ targets: colMappings.transCurrency, responsivePriority: 4, class: 'dt-center', width: '100px', },
				{ targets: colMappings.amount, responsivePriority: 5, class: 'dt-center', render: numberColor },
				{ targets: colMappings.relatedName, responsivePriority: 6, class: 'dt-center' },
				{ targets: colMappings.createtime, responsivePriority: 7, class: 'dt-center' },
				{ targets: colMappings.comment, responsivePriority: 8, class: 'dt-center' },
			],


			'footerCallback': function (row, data, start, end, display) {
				var api = this.api();

				var intVal = function (i) {
					return typeof i === 'string' ?
						i.replace(/[\$,]/g, '') * 1 :
						typeof i === 'number' ?
							i : 0;
				};

				var amount = footer[colMappings.amount]
					= api
						.column(colMappings.amount)
						.data()
						.reduce(function (a, b) {
							return intVal(a) + intVal(b);
						}, 0);

				$(api.column(colMappings.transCurrency).footer()).html('總和:');
				$(api.column(colMappings.amount).footer()).html(footerColor(Number(amount)));


			},

		});


	};

	var initForm = function () {

		// Form Validate
		// http://jqueryvalidation.org/validate/
		// Custom alphaNumeric validator
		$.validator.methods.alphaNumeric = function (value, element) {
			return this.optional(element) || /^[a-z0-9]+$/i.test(value);
		};
		// Set up validator for form
		$('#history-form').validate({

			// define validation rules
			rules: {
				datetimes: {
					required: true,
				},
				transTypeCode: {
					digits: true,
					maxlength: 20,
				},
				transCurrency: {
					digits: true,
					maxlength: 20,
				},
				storeAccount: {
					alphaNumeric: true,
					maxlength: 20,
				},
				agentAccount: {
					alphaNumeric: true,
					maxlength: 20,
				},
				account: {
					alphaNumeric: true,
					maxlength: 20,
				},

			},

			// custom invalid messages
			messages: {
				datetimes: {
					required: '查詢時間爲必填欄位',
				},
				transTypeCode: {
					digits: '轉帳類型必須是數字',
					maxlength: '轉帳類型長度不可超過 20',
				},
				transCurrency: {
					digits: '轉帳幣別必須是數字',
					maxlength: '轉帳幣別長度不可超過20',
				},
				storeAccount: {
					alphaNumeric: '代理帳號必須是數字或英文字母',
					maxlength: '店家帳號長度不可超過 20',
				},
				agentAccount: {
					alphaNumeric: '代理帳號必須是數字或英文字母',
					maxlength: '店家帳號長度不可超過 20',
				},
				account: {
					alphaNumeric: '會員帳號必須是數字或英文字母',
					maxlength: '會員帳號長度不可超過 20',
				},
			},

			// Disable show error
			showErrors: function (errorMap, errorList) {
				// Do nothing here
			},

			//display error alert on form submit  
			invalidHandler: function (event, validator) {

				let errorMessage = validator.errorList[0].message;
				for (let i = 1; i < validator.errorList.length; i++)	errorMessage += ' , ' + validator.errorList[i].message;

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
				mApp.block('#history-form', {
					size: 'lg',
					type: 'loader',
					state: 'primary',
					message: '搜尋...'
				});

				// Collect form data
				let formData = $(form).serializeArray().reduce(function (obj, item) {
					obj[item.name] = item.value;
					return obj;
				}, {});

				// Convert datetimes to UTC time for backend
				let datetimes = formData.datetimes.split('-');
				let startTime = datetimes[0].trim();
				let endTime = datetimes[1].trim();
				startTime = moment(startTime).utc().format('YYYY/MM/DD HH:mm');
				endTime = moment(endTime).utc().format('YYYY/MM/DD HH:mm');
				formData.datetimes = startTime + '-' + endTime;

				console.log(formData);

				$.ajax({
					type: 'POST',
					url: '/home/storeCurrency/history/search',
					data: formData,
					timout: 30000, // 30 sec
					// Success
					success: function (response) {
						console.log(response);
						// Process data to put in data table
						dataset = [];
						if (response.err === false && response.msg === 'success') {
							let data = response.data;
							let index = 0;
							for (let i = 0; i < data.length; i++) {
								dataset[index++] = { ...data[i] };
							}
						}
						else {
							swal({
								title: '搜尋失敗',
								text: response.msg,
								type: 'error',
								confirmButtonText: 'OK'
							});
						}
                        oTable.ajax.reload();
                        $('#m_search').attr('disabled', false);
						mApp.unblock('#history-form'); // Unblock 
					},
					// Fail
					error: function (xhr, textStatus, errorThrown) {

						if (textStatus === 'timeout') {
							swal({
								title: '搜尋失敗',
								text: '搜尋超時',
								type: 'error',
								confirmButtonText: 'OK'
							});
						}
						else {
							swal({
								title: '搜尋失敗',
								text: '搜尋失敗',
								type: 'error',
								confirmButtonText: 'OK'
							});
                        }
                        
                        $('#m_search').attr('disabled', false);
						mApp.unblock('#history-form'); // Unblock 
					}
				});
			}
		});

		// Init components
		initSelect2();
		initDateTimePicker();

		// Init tab toggle listener
		$('a[data-toggle="tab"]').on('shown.bs.tab', function (e) {

			// Init select2 UI
			initSelect2();

			// Clear value in other tab
			$('#storeAccount').val(null).trigger('change');
			$('#agentAccount').val(null).trigger('change');
			$('#account').val(null);
		});

		// Init reset button
		$('#m_reset').on('click', function (e) {
			e.preventDefault();
			$('.m-input').each(function () {
				$(this).val('');
			});
			initSelect2();
		});

	};


	function initSelect2() {
		$('#storeAccount').select2({
			data: stores,
			placeholder: '請選擇欲查詢的店家旗下',
			templateResult: function (data) { return data.html },
			templateSelection: function (data) { return data.text },
			escapeMarkup: function (markup) { return markup; },
		});
		$('#agentAccount').select2({
			data: agents,
			placeholder: '請選擇欲查詢的代理旗下',
			templateResult: function (data) { return data.html },
			templateSelection: function (data) { return data.text },
			escapeMarkup: function (markup) { return markup; },
		});
		$('#transTypeCode').select2({
			data: transType,
			placeholder: '請選擇欲查詢的交易類型',
			templateResult: function (data) { return data.html },
			templateSelection: function (data) { return data.text },
			escapeMarkup: function (markup) { return markup; },
		});
		$('#transCurrency').select2({
			data: storeCurrency,
			placeholder: '請選擇欲查詢的交易類型',
			templateResult: function (data) { return data.html },
			templateSelection: function (data) { return data.text },
			escapeMarkup: function (markup) { return markup; },
		});
		if(role === 'store' || role === 'agent') {
			$('#transCurrency').val(storeCurrency[0].id).trigger('change');
			$('#transCurrency').parent().hide();
		}
	}

	function initDateTimePicker() {

		$('input[name="datetimes"]').daterangepicker({
			timePicker: true,
			timePicker24Hour: true,
			startDate: moment().local('hour').add(1, 'minutes').subtract(24, 'hour'),
			endDate: moment().local('hour').add(1, 'minutes'),
			locale: {
				format: 'YYYY/MM/DD HH:mm'
			}
		});

	}

	// Function for rendering number colorful
	function numberColor(data, type, full, meta) {
		if (typeof data !== 'number') {
			return data;
		}
		if (data <= 0) {
			return '<span class="m--font-bold m--font-danger">' + data + '</span>';
		}
		else {
			return '<span class="m--font-bold m--font-info">' + data + '</span>';
		}
	}

	// Function for rendering transaction type
	function transTypeColor(data, type, full, meta) {
		if (typeof data !== 'number') return data;

		let curType = transType.find((row) => (Number(row.id) === data));
		if (!curType) return data;

		return '<span class="m-badge m-badge--' + curType.state + ' m-badge--dot"></span>&nbsp;' +
			'<span class="m--font-bold m--font-' + curType.state + '">' + curType.title + '</span>';
	}

	function footerColor(data) {
		if (typeof data !== 'number') {
			return data;
		}
		if (data <= 0) {
			return '<span class="m-badge m-badge--danger m-badge--wide m-badge--rounded">' + data + '</span>';
		}
		else {
			return '<span class="m-badge m-badge--info m-badge--wide m-badge--rounded">' + data + '</span>';
		}
	}

	return {
		initTable: initTable,
		initForm: initForm
	};

}();

jQuery(document).ready(function () {
	History.initTable();
	History.initForm();
});