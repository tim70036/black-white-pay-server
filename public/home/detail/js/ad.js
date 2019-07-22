var Ad = function () {


    var initForm = function () {


        // Init form content
        $('#id').val(adData.id);
        $('#title').val(adData.title);

        let canvas = document.createElement('canvas');
        let ctx = canvas.getContext('2d');
        
        var img = new Image();
        img.onload = function() {
            canvas.width = img.width
			canvas.height = img.height
            ctx.drawImage(img, 0, 0);
        };
        img.src = adData.url;
        $('#image-preview').append(canvas);

        // Init button
        // Reset all input
        $('#reset-btn').click(function () {
            $('#title').val('');
        });


        // Form Validate
        // http://jqueryvalidation.org/validate/

        // Set up validator for form
        $('#ad-form').validate({
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
                // Block UI
                $('#submit-btn').attr('disabled', true);
                mApp.block('#ad-portlet', {
                    size: 'lg',
                    type: 'loader',
                    state: 'primary',
                    message: '更新中...'
                });

                let data = new FormData();
                let file = $('#photo').get(0).files[0];
                let title = $('#title').val();
                let id = $('#id').val();
                
                data.append('adImg', file);
                data.append('title', title);
                data.append('id', id);

                $.ajax({
                    type: 'POST',
                    url: '/home/detail/ad/edit',
                    contentType: false,
                    processData: false,
                    data: data, // serializes the form, note it is different from other AJAX in this module
                    timout: 5000, // 5 sec
                    // Success
                    success: function (result) {
                        $('#submit-btn').attr('disabled', false);
                        mApp.unblock('#ad-portlet'); // Unblock 

                        // Sweet alert
                        if (!result.err) {
                            swal({
                                title: '執行成功',
                                text: '公告已更新!',
                                type: 'success',
                                confirmButtonText: 'OK'
                            }).then(function (result) {
                                // Reload page
                                window.location='/home/info/ad';
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
                        $('#submit-btn').attr('disabled', false);
                        mApp.unblock('#ad-portlet'); // Unblock 

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
        initForm: initForm
    };

}();

jQuery(document).ready(function () {
    Ad.initForm();
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