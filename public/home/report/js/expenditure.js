var dataset = [], oTable;
var footer = [];
var expenditureReport = function() {
	
	var initForm = function() {

        initDateTimePicker();
        initSelect2()

		// Form Validate
		// http://jqueryvalidation.org/validate/
		// Custom alphaNumeric validator
		$.validator.methods.alphaNumeric = function( value, element ) {
			return this.optional( element ) ||  /^[a-z0-9]+$/i.test( value ) ;
		}
		// Set up validator for form
		$( '#expenditure-form' ).validate({
            // define validation rules
            rules: {
                storeAccount: {
                    alphaNumeric: true,
					maxlength: 20,
					// required: true,
                },
                agentAccount: {
					alphaNumeric: true,
                	maxlength: 20,
                },
				memberAccount: {
                    alphaNumeric: true,
					maxlength: 20,
                },

                currencyName: {
                    required: true,
                },
                
				transType: {
                    maxlength: 20,
                },
                
                datetimes: {
                	required: true,
				},
            },
			
			// custom invalid messages
			messages: { 
				storeAccount: {
					maxlength: '長度不可超過 20',
					alphaNumeric: '必須是數字或英文字母',
                },
                agentAccount: {
                    maxlength: '長度不可超過 20',
                    alphaNumeric: '必須是數字或英文字母',
				},
				memberAccount: {
					maxlength: '長度不可超過 20',
                    alphaNumeric: '必須是數字或英文字母',
                },
                currencyName: {
                    required: '幣別為必填欄位',
                },
				transType: {
                    maxlength: 20,
                },
                datetimes: {
                	required: '時間爲必填欄位',
				},
			},

			// Disable show error
			showErrors: function(errorMap, errorList) {
				// Do nothing here
			},

			//display error alert on form submit  
            invalidHandler: function(event, validator) {  
				
				let errorMessage = validator.errorList[0].message;
				for(let i=1 ; i<validator.errorList.length ; i++)	errorMessage += ' , ' +  validator.errorList[i].message;

                swal({
                    "title": "欄位資料錯誤", 
                    "text": errorMessage, 
                    "type": "error",
                    confirmButtonText: "OK"
                });
                
            },

            submitHandler: function (form) {
				// Ready to send data
                // Block UI
                $('#m_search').attr('disabled', true);
				mApp.block('#expenditure-form', {
					size: 'lg',
					type: 'loader',
					state: 'primary',
					message: '搜尋...'
                });
                
                let formData = $(form).serializeArray().reduce(function(obj, item) {
					obj[item.name] = item.value;
					return obj;
                }, {});
                
                let datetimes = formData.datetimes.split("-");
				let startTime = datetimes[0].trim();
				let endTime = datetimes[1].trim();
				startTime 	= moment(startTime).utc().format('YYYY/MM/DD HH:mm');
				endTime 	= moment(endTime).utc().format('YYYY/MM/DD HH:mm');
                formData.datetimes = startTime + '-' + endTime;
                
                formData.transType = $("#transType").val();
                if(formData.storeAccount === undefined) formData.storeAccount = '';
		
				$.ajax({
					type: "POST",
					url: "/home/report/expenditure/search",
					data: formData, // serializes the form, note it is different from other AJAX in this module
					timout: 30000,
					success: function(response){
						
						dataset = [];
						if(response.errCode === 0){
							let data = response.data;
							
							if(data.length == 20000){
								swal({
									title: "資料達兩萬筆上限",
									text: "請縮小查詢條件",
									type: "warning",
									confirmButtonText: "OK"
								});
							}  
	  						
							dataset = data;
							oTable.ajax.reload();

						}else {
							swal({
								//title: "資料達兩萬筆上限",
								text: response.msg,
								type: "warning",
								confirmButtonText: "OK"
							});
						}
                        oTable.ajax.reload();
                        $('#m_search').attr('disabled', false);
						mApp.unblock('#expenditure-form'); // Unblock 
						
					},
					error: function(xhr, textStatus, errorThrown){
                        $('#m_search').attr('disabled', false);
                        mApp.unblock('#expenditure-form'); // Unblock
                        
						if(textStatus==="timeout") {
							swal({
								title: "執行失敗",
								text: "時間超時!",
								type: "error",
								confirmButtonText: "OK"
							});
						}
						
					 }
				});
            }
        });   
    };

    var colMappings = {
		account : 0,
        name : 1,
        createtime: 2,
		transType : 3,
		comment: 4,
		expenditure : 5,
		income : 6,
		sum : 7,
	};

    var initTable = function(){
		var table = $('#m_table_1');
		oTable = table.DataTable({
			responsive: true,
			searchDeley: 500,
			"ajax": function(data, callback, settings){
				callback({data: dataset});
			},

			dom: `
			<'row'<'col-sm-6 text-left'><'col-sm-6 text-right'f>>
			<'row'<'col-sm-12'tr>>
			<'row'<'col-sm-12 col-md-5'i><'col-sm-12 col-md-7 dataTables_pager'lp>>`,

			order: [[colMappings.createtime, 'desc']],

			columns:[
				{ title: "帳號", data: 'account'},
                { title: "名稱", data: 'name'},
                { title: "時間", data: 'createtime'},
				{ title: "轉帳類型", data: 'transType'},
				{ title: "備註", data: 'comment'},
				{ title: "轉出", data: 'expenditure'},
				{ title: "轉入", data: 'income'},
				{ title: "淨收支", data: 'sum'},
			],
			
			columnDefs: [
				
				{ targets: colMappings.account, 		responsivePriority : 1, 	class : 'dt-center'},
				{ targets: colMappings.name, 			responsivePriority : 2, 	class : 'dt-center'},
				{ targets: colMappings.createtime, 		responsivePriority : 3, 	class : 'dt-center'},
				{ targets: colMappings.transType, 		responsivePriority : 4, 	class : 'dt-center'},
				{ targets: colMappings.comment, 		responsivePriority : 5, 	class : 'dt-center'},
				{ targets: colMappings.expenditure, 	responsivePriority : 6, 	class : 'dt-center', render: numberColor},
				{ targets: colMappings.income, 			responsivePriority : 7, 	class : 'dt-center', render: numberColor},
				{ targets: colMappings.sum, 			responsivePriority : 8, 	class : 'dt-center', render: numberColor},
				
            ],

			"footerCallback": function(row, data, start, end, display){
				var api = this.api();

				var intVal = function ( i ) {
	                return typeof i === 'string' ?
	                    i.replace(/[\$,]/g, '')*1 :
	                    typeof i === 'number' ?
	                        i : 0;
            	};
				var expenditure 
								= footer[colMappings.expenditure]
								= api
				                .column( colMappings.expenditure )
				                .data()
				                .reduce( function (a, b) {
				                    return intVal(a) + intVal(b);
				                }, 0 ).toFixed(2);
				var income 
									= footer[colMappings.income]
									= api
					                .column( colMappings.income )
					                .data()
					                .reduce( function (a, b) {
					                    return intVal(a) + intVal(b);
					                }, 0 ).toFixed(2);
				var sum 
								= footer[colMappings.sum]
								= api
				                .column( colMappings.sum )
				                .data()
				                .reduce( function (a, b) {
				                    return intVal(a) + intVal(b);
				                }, 0 ).toFixed(2);
				
                $( api.column( colMappings.comment ).footer() ).html('總和:');
	            $( api.column( colMappings.expenditure ).footer() ).html(footerColor(Number(expenditure)));
	            $( api.column( colMappings.income ).footer() ).html(footerColor(Number(income)));
	            $( api.column( colMappings.sum ).footer() ).html(footerColor(Number(sum)));
				

        	},

			
		});
    };
    
	$('#m_reset').on('click', function(e) {
		e.preventDefault();
		
		$('.m-input').each(function() {
			$(this).val('');
			oTable.column($(this).data('col-index')).search('', false, false);
		});
		initSelect2();
		
	});

	$('#export').on('click', function(e) {
		e.preventDefault();
		
		let filename = '收支報表.xlsx';
		let sheetname = '收支';
		var datetime = $('#datetime')[0].value;
		let header = [
				["收支報表",,,,,,,,],
				[datetime,,,,,,,,],
				["帳號", "名稱", "計算時間", "轉帳類型", "備註","轉出", "轉入", "淨收支"],
				footer,
					];
		let elementArray = [];

		oTable.rows().eq(0).each( function(index){
			let row = oTable.row(index);
			let data = row.data();
			let {account, name, createtime, transType, comment, expenditure, income, sum} = data;
			elementArray.push([account, name, createtime, transType, comment, expenditure, income, sum]);
		});
		
		let data = header.concat(elementArray);
		//console.log({data});
		downloadxlsx(filename, sheetname, data);

		
    });
    
    // Init tab toggle listener
		$('a[data-toggle="tab"]').on('shown.bs.tab', function (e) {

			// Init select2 UI
			initSelect2();

			// Clear value in other tab
			$('#storeAccount').val(null).trigger('change');
			$('#agentAccount').val(null).trigger('change');
			$('#memberAccount').val(null);
		});

	function downloadxlsx(filename, sheetname, data) {
		
		//所使用函式可參考js-xlsx的GitHub文件[https://github.com/SheetJS/js-xlsx]


		//datenum
		function datenum(v, date1904) {
			if (date1904) v += 1462;
			var epoch = Date.parse(v);
			return (epoch - new Date(Date.UTC(1899, 11, 30))) / (24 * 60 * 60 * 1000);
		}


		//sheet_from_array_of_arrays
		function sheet_from_array_of_arrays(data, opts) {
			var ws = {};
			var range = { s: { c: 10000000, r: 10000000 }, e: { c: 0, r: 0 } };
			for (var R = 0; R != data.length; ++R) {
				for (var C = 0; C != data[R].length; ++C) {
					if (range.s.r > R) range.s.r = R;
					if (range.s.c > C) range.s.c = C;
					if (range.e.r < R) range.e.r = R;
					if (range.e.c < C) range.e.c = C;
					var cell = { v: data[R][C] };
					if (cell.v == null) continue;
					var cell_ref = XLSX.utils.encode_cell({ c: C, r: R });

					if (typeof cell.v === 'number') cell.t = 'n';
					else if (typeof cell.v === 'boolean') cell.t = 'b';
					else if (cell.v instanceof Date) {
						cell.t = 'n'; cell.z = XLSX.SSF._table[14];
						cell.v = datenum(cell.v);
					}
					else cell.t = 's';

					ws[cell_ref] = cell;
				}
			}
			if (range.s.c < 10000000) ws['!ref'] = XLSX.utils.encode_range(range);
			return ws;
		}


		//s2ab
		function s2ab(s) {
			var buf = new ArrayBuffer(s.length);
			var view = new Uint8Array(buf);
			for (var i = 0; i != s.length; ++i) view[i] = s.charCodeAt(i) & 0xFF;
			return buf;
		}


		//Workbook
		function Workbook() {
			if (!(this instanceof Workbook)) return new Workbook();
			this.SheetNames = [];
			this.Sheets = {};
		}

		var merge = { s: {r:0, c:0}, e: {r:0, c:8} };
		var merge1 = { s: {r:1, c:0}, e: {r:1, c:8} };
		//write
		var wb = new Workbook();
		var ws = sheet_from_array_of_arrays(data);
		if(!ws['!merges']) ws['!merges'] = [];
		ws['!merges'].push(merge);
		ws['!merges'].push(merge1);
		wb.SheetNames.push(sheetname);
		wb.Sheets[sheetname] = ws;
		var wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });


		//saveAs
		saveAs(new Blob([s2ab(wbout)], { type: "application/octet-stream" }), filename)


	}

	function initSelect2(){
        $('#storeAccount').select2({
			data: stores,
			placeholder: "請選擇分店",
			templateResult: function(data) {return data.html},
			templateSelection: function(data) {return data.text},
			escapeMarkup: function(markup) {return markup;},
		});
		$('#agentAccount').select2({
			data: agents,
			placeholder: "請選擇代理",
			templateResult: function(data) {return data.html},
			templateSelection: function(data) {return data.text},
			escapeMarkup: function(markup) {return markup;},
        });
        
        $('#currencyName').select2({
			data: currency,
			placeholder: "請選擇幣別",
			templateResult: function(data) {return data.html},
			templateSelection: function(data) {return data.text},
			escapeMarkup: function(markup) {return markup;},
		});
        
        $('#transType').select2({
			multiple: true,
			tags: true,
			data: transType,
			
			placeholder: "請選擇異動類型",
			templateResult: function(data) { return data.html},
			templateSelection: function(data) { return data.text},
			escapeMarkup: function(markup) { return markup;},
		});
    }

	function initDateTimePicker(){

	  $('input[name="datetimes"]').daterangepicker({
	    timePicker: true,
	    "timePicker24Hour": true,
	    startDate: moment().local('hour').add(1, 'minutes').subtract(24, 'hour'),
	    endDate: moment().local('hour').add(1, 'minutes'),
	    locale: {
	      format: 'YYYY/MM/DD HH:mm'
	    }
	  });

	}
	
    function numberColor(data, type, full, meta) {
			if (typeof data !== 'number') {
				return data;
			}
			if(data <= 0){
				return '<span class="m--font-bold m--font-danger">' + data + '</span>';
			}
			else{
				return '<span class="m--font-bold m--font-info">' + data + '</span>';
			}
    }

    function footerColor(data){
    	if (typeof data !== 'number') {
				return data;
			}
			if(data <= 0){
				return '<span class="m-badge m-badge--danger m-badge--wide m-badge--rounded">' + data + '</span>';
			}
			else{
				return '<span class="m-badge m-badge--info m-badge--wide m-badge--rounded">' + data + '</span>';
			}
    }

	return {
		init: function(){
			initTable();
			initForm();
		}
		
	};

}();

jQuery(document).ready(function() {
	expenditureReport.init();
});