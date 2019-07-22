var Transfer = function() {

	var initTransferForm = function() {

		// Select 2
		// initSelect2();

		// Form Validate
		// http://jqueryvalidation.org/validate/
		// Custom alphaNumeric validator
		$.validator.methods.alphaNumeric = function( value, element ) {
			return this.optional( element ) ||  /^[a-z0-9]+$/i.test( value ) ;
		};
		// Custom notEqual validator
		$.validator.methods.notEqual = function( value, element, param ) {
			return this.optional( element ) ||  value !=  $(param).val() ;
		};
		
		// Set up validator for form
		$( '#transfer-form' ).validate({
			// define validation rules
			rules: {
				accountFrom: {
					required: true,
					maxlength: 20,
					alphaNumeric: true,
				},
				accountTo: {
					required: true,
					maxlength: 20,
					alphaNumeric: true,
					notEqual: '#accountFrom',
				},
				amount: {
					required: true,
					number: true
				},
				transPwd: {
					required: true,
					maxlength: 20,
					alphaNumeric: true,
				},
				comment: {
					maxlength: 40
				},
			},
			
			// custom invalid messages
			messages: { 
				accountFrom: {
					required: '轉出帳號爲必填欄位',
					maxlength: '長度不可超過 20',
					alphaNumeric: '必須是數字或英文字母',
				},
				accountTo: {
					required: '轉入帳號爲必填欄位',
					maxlength: '長度不可超過 20',
					alphaNumeric: '必須是數字或英文字母',
					notEqual: '轉入帳號不能跟轉出帳號相同',
				},
				amount: {
					required: '轉帳數量爲必填欄位',
					number: '必須是整數'
				},
				transPwd: {
					required: '個人交易密碼爲必填欄位',
					maxlength: '長度不可超過 20',
					alphaNumeric: '必須是數字或英文字母',
				},
				comment: {
					maxlength: '長度不可超過 40'
				},
			},

			//display error alert on form submit  
			invalidHandler: function(event, validator) {  
                
				swal({
					'title': '欄位資料錯誤', 
					'text': '請更正錯誤欄位後再試一次', 
					'type': 'error',
					confirmButtonText: 'OK'
				});
                
			},

			submitHandler: function (form) {
				// Ready to send data
                // Block UI
                $('#submitButton').attr('disabled', true);
				mApp.block('#transfer-portlet', {
					size: 'lg',
					type: 'loader',
					state: 'primary',
					message: '轉帳中...'
				});

				$.ajax({
					type: 'POST',
					url: '/home/mainCurrency/transfer/transfer',
					data: $(form).serialize(), // serializes the form, note it is different from other AJAX in this module
					timout: 30000, // 30 sec
					// Success
					success: function(result){
						$('#submitButton').attr('disabled', false);
						mApp.unblock('#transfer-portlet'); // Unblock 
						
						// Sweet alert
						if(!result.err){
							swal({
								title: '執行成功',
								text: '轉帳已完成!',
								type: 'success',
								confirmButtonText: 'OK'
							}).then(function(result){
								// Reload page
								window.location.reload();
							});
						}
						else{
							swal({
								title: '執行失敗',
								text: result.msg,
								type: 'error',
								confirmButtonText: 'OK'
							});
						}
					},
					// Fail
					error: function(xhr, textStatus, errorThrown){
                        $('#submitButton').attr('disabled', false);
						mApp.unblock('#transfer-portlet'); // Unblock 

						if(textStatus==='timeout') {
							swal({
								title: '執行失敗',
								text: '執行超時',
								type: 'error',
								confirmButtonText: 'OK'
							});
						}
						else{
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
	};
	
	var initComponent = function(){

		// Init reset button
		$('.m_reset').on('click', function(e) {
			e.preventDefault();
			$('.m-input').each(function() {
				$(this).val('');
			});
			// initSelect2();
		});
	};

	// function initSelect2(){
	// 	// Select 2
	// 	$('#transTypeOptionCode').select2({
	// 		data: transTypeOptions,
	// 		placeholder: '請選擇轉帳類型',
	// 		width: '100%',
	// 		templateResult: function(data) {return data.html},
	// 		templateSelection: function(data) {return data.text},
	// 		escapeMarkup: function(markup) {return markup;},
	// 	});
	// }

	return {
		initTransferForm:  initTransferForm,
		// initPurchaseForm: initPurchaseForm,
		initComponent: initComponent,
	};

}();

jQuery(document).ready(function() {
	Transfer.initTransferForm();
	// Transfer.initPurchaseForm();
	Transfer.initComponent();
});