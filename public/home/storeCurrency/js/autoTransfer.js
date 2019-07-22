var upload_object = {};

var ImportExcel = function () {
  var uploadfile;

  function initdropzone() {
    if(window.File && window.FileReader && window.FileList && window.Blob){
      console.log("OK");
    }else{
      console.log("not support");
    }
    Dropzone.options.importdropzone = {
      paramName: 'file',
      clickable: true,
      maxFiles: 1,
      addRemoveLinks: true,
      dictRemoveFile: "删除",
      acceptedFiles: ".xls, .xlsx",
	  autoProcessQueue: false,
	  init: function() {
		this.on("addedfile", function(file) {
			if(Dropzone.forElement("#importdropzone").files.length > 1){
				this.removeFile(Dropzone.forElement("#importdropzone").files[0]);
			}
		});
	  },
      accept: function(file, done) {
          var filename = file.name;
          uploadfile = file;
          var reader = new FileReader();
          reader.onload = function(ev) {
            try{
              var data = ev.target.result,
                  workbook = XLSX.read(data , {
                    type: 'binary'
                  });
            }
            catch(e) {
              return;
            }

          // 表格范围，可用于判断表头数量是否正确
            var fromTo = '';
            for(var sheet in workbook.Sheets) {
              if(workbook.Sheets.hasOwnProperty(sheet)) {
                fromTo = workbook.Sheets[sheet]['!ref'];
                break; // 只读取一张表
              }
            }
            if(fromTo[0] !== 'A' || fromTo[3] !== 'D'){
			  alert("檔案內容格式錯誤");
			  Dropzone.forElement("#importdropzone").removeAllFiles(true);
              return;
            }
            workbook.SheetNames.forEach(function(sheetName) {
              var XL_row_object = XLSX.utils.sheet_to_row_object_array(workbook.Sheets[sheetName]);
              json_object = JSON.stringify(XL_row_object);
              json_object = JSON.parse(json_object);
              upload_object[filename] = json_object;
            });
          }

          reader.onerror = function(ex) {
          };

          reader.readAsBinaryString(file);
        },
	};
	
  }

  function initForm() {

		$.validator.methods.alphaNumeric = function( value, element ) {
			return this.optional( element ) ||  /^[a-z0-9]+$/i.test( value ) ;
		};

       $('#import-form').validate({
           // define validation rules
           rules: {
               	file: {
                	required: true
			   	},
			  	transPwd: {
					required: true,
					maxlength: 20,
					alphaNumeric: true,
				},
           },

           // custom invalid messages
           messages: {
               	file: {
                	required: '請上傳檔案'
				},
				transPwd: {
					required: '個人交易密碼爲必填欄位',
					maxlength: '長度不可超過 20',
					alphaNumeric: '必須是數字或英文字母',
				},
           },

           // display error alert on form submit
           invalidHandler: function(event, validator) {

               swal({
                   "title" : "欄位資料錯誤",
                   "text" : "請更正錯誤後再試一次",
                   "type" : "error",
                   confirmButtonText: "OK"
               });
           },

           submitHandler: function () {

               // Ready to send data
               // Block modal
               if(Dropzone.forElement("#importdropzone").files.length > 1){
                 alert("請一次上傳一個檔案");
                 return;
               }

               if(Dropzone.forElement("#importdropzone").files.length <= 0){
                 alert("請上傳檔案");
                 return;
               }

               $('#submitButton').attr('disabled', true);
               mApp.block('#import-form', {
                   size: 'lg',
                   type: 'loader',
                   state: 'primary',
                   message: '準備上傳...'
               });

			   $('#evalResult').empty();

                  $.ajax({
                         type: 'POST',
                         url: '/home/storeCurrency/autoTransfer/upload',
						 data: { transPwd: $('#transPwd').val(), data : upload_object[Dropzone.forElement("#importdropzone").files[0].name]}, // serializes the form, note it is different from other AJAX in this module
						 // data : upload_object[Dropzone.forElement("#importdropzone").files[0].name]
                         success: function(result) {
                            $('#submitButton').attr('disabled', false);
                            mApp.unblock('#import-form'); // Unblock button

                             //Sweet alert
                            if(!result.err) {

								 //location.reload();
								 let tmp = $('#uploadFileName').html().split(':')[0];
								 $('#uploadFileName').html(tmp +': &ensp;'+ Dropzone.forElement("#importdropzone").files[0].name);
								 var detail = $(`<tr>
													<td>0</td>
													<td>執行成功</td>
												</tr>`);
								$('#evalResult').append(detail);
                                 swal({
									title: "執行成功",
									text: result.msg,
									type: "success",
									confirmButtonText: "OK"
                                 }).then(function(result){
									Dropzone.forElement("#importdropzone").removeAllFiles(true);
									$('#transPwd').val(''); 
                                 });
                            }
                            else {
								let tmp = $('#uploadFileName').html().split(':')[0];
								$('#uploadFileName').html(tmp +': &ensp;'+ Dropzone.forElement("#importdropzone").files[0].name);
								if(result.detail !== undefined) {
									for(let i=0; i< result.detail.length; i++){
										let detail = $(`<tr>
															<td>${result.detail[i].index + 2}</td>
															<td><font color="red">${result.detail[i].msg}</font></td>
														</tr>`);
										$('#evalResult').append(detail);
									}
								}
								swal({
									title: "執行失敗",
									text: result.msg,
									type: "error",
									confirmButtonText: "OK"
								}).then(function(result){
									Dropzone.forElement("#importdropzone").removeAllFiles(true);
									$('#transPwd').val('');
								});
                            }
                         },
                         error: function(XMLHttpRequest, textStatus, errorThrown) {
                             alert("some error : " );
                          }
                     });

           }

       });
  };

  return {
    initdropzone : initdropzone,
    initForm : initForm
  };
}();
ImportExcel.initdropzone();



jQuery(document).ready(function() {
    ImportExcel.initForm();
});

function cancel() {
  Dropzone.forElement("#importdropzone").removeAllFiles(true);
  $('#transPwd').val('');
}

function clearDetail() {
	var tmp = $('#uploadFileName').html().split(':')[0];
	$('#uploadFileName').html(tmp+': &ensp;');
	$('#evalResult').empty();
}
