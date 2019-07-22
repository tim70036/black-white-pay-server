var Misc = function () {
    function initForm() {
        $.validator.methods.email = function (value, element) {
            console.log(value);
            return this.optional(element) || /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/.test(value);
        };
        // Custom alphaNumeric validator
        $.validator.methods.alphaNumeric = function (value, element) {
            console.log(value);
            return this.optional(element) || /^[a-z0-9]+$/i.test(value);
        };

        // Custom float validator
        $.validator.methods.float = function (value, element) {
            console.log(value);
            return this.optional(element) || $.isNumeric(value);
        };

        $('#accountedit-form').validate({
            rules: {
                name: {
                    required: true,
                    maxlength: 20
                },
                nickName: {
                    required: true,
                    maxlength: 20
                },
                email: {
                    email: true,
                    maxlength: 40
                },
                address: {
                    maxlength: 100,
                },
                phoneNumber: {
                    maxlength: 15,
                },
                bussinesshours: {
                    maxlength: 100,
                }
            },
            messages: {
                name: {
                    required: '名稱爲必填欄位',
                    maxlength: '長度不可超過 20'
                },
                nickName: {
                    required: '暱稱爲必填欄位',
                    maxlength: '長度不可超過 20'
                },
                email: {
                    email: '請輸入正確的 email 格式',
                    maxlength: '長度不可超過 40'
                },
                address: {
                    maxlength: '長度不可超過100'
                },
                phoneNumber: {
                    maxlength: '長度不可超過15'
                },
                bussinesshours: {
                    maxlength: '長度不可超過100'
                }
            },
            invalidHandler: function (event, validator) {

                swal({
                    'title': '欄位資料錯誤',
                    'text': '請更正錯誤欄位後再試一次',
                    'type': 'error',
                    confirmButtonText: 'OK'
                });

            },
            submitHandler: function (form) {
                $('#accounteditButton').attr('disabled', true);
                mApp.block('#accountedit-modal', {
                    size: 'lg',
                    type: 'loader',
                    state: 'primary',
                    message: '修改中...'
                });

                $.ajax({
                    type: 'POST',
                    url: '/home/account/misc/edit?tab=account',
                    data: $(form).serialize(),
                    timout: 30000,
                    success: function (result) {
                        mApp.unblock('#accountedit-modal');
                        $('#accounteditButton').attr('disabled', false);

                        if (!result.err) {
                            swal({
                                title: '執行成功',
                                text: result.msg,
                                type: 'success',
                                confirmButtonText: 'OK'
                            }).then(function (result) {
                                // Reload page
                                location.reload();
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
                    error: function (xhr, textStatus, errorThrown) {

                        // Unblock button
                        mApp.unblock('#accountedit-modal');
                        $('#accounteditButton').attr('disabled', false);

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
        $('#pwdedit-form').validate({
            rules: {
                oldpassword: {
                    required: true,
                    maxlength: 20,
                    alphaNumeric: true
                },
                newpassword: {
                    required: true,
                    maxlength: 20,
                    alphaNumeric: true
                },
                confirmpassword: {
                    required: true,
                    equalTo: '#newpassword',
                    maxlength: 20,
                    alphaNumeric: true,
                }
            },

            messages: {
                oldpassword: {
                    required: '舊密碼爲必填欄位',
                    maxlength: '長度不可超過20',
                    alphaNumeric: '必須是數字或英文字母',
                },
                newpassword: {
                    required: '新密碼爲必填欄位',
                    maxlength: '長度不可超過20',
                    alphaNumeric: '必須是數字或英文字母',
                },
                confirmpassword: {
                    required: '確認密碼爲必填欄位',
                    equalTo: '請輸入相同的密碼',
                    maxlength: '長度不可超過 20',
                    alphaNumeric: '必須是數字或英文字母',
                },
            },
            invalidHandler: function (event, validator) {

                swal({
                    'title': '欄位資料錯誤',
                    'text': '請更正錯誤欄位後再試一次',
                    'type': 'error',
                    confirmButtonText: 'OK'
                });

            },
            submitHandler: function (form) {
                $('#pwdeditButton').attr('disabled', true);
                mApp.block('#pwdedit-modal', {
                    size: 'lg',
                    type: 'loader',
                    state: 'primary',
                    message: '修改中...'
                });

                $.ajax({
                    type: 'POST',
                    url: '/home/account/misc/edit?tab=pwd',
                    data: $(form).serialize(),
                    timout: 30000,
                    success: function (result) {
                        $('#pwdeditButton').attr('disabled', false);
                        mApp.unblock('#pwdedit-modal');

                        if (!result.err) {
                            swal({
                                title: '執行成功',
                                text: result.msg,
                                type: 'success',
                                confirmButtonText: 'OK'
                            }).then(function (result) {
                                // Reload page
                                location.reload();
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
                    error: function (xhr, textStatus, errorThrown) {

                        // Unblock button
                        $('#pwdeditButton').attr('disabled', false);
                        mApp.unblock('#pwdedit-modal');

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
        $('#transPwdedit-form').validate({
            rules: {
                oldTransPwd: {
                    required: true,
                    maxlength: 20,
                },
                newTransPwd: {
                    required: true,
                    minlength: 6,
                    maxlength: 6,
                    digits: true
                },
                confirmTransPwd: {
                    required: true,
                    equalTo: '#newTransPwd',
                    minlength: 6,
                    maxlength: 6,
                    digits: true,
                }
            },

            messages: {
                oldTransPwd: {
                    required: '舊交易密碼爲必填欄位',
                    maxlength: '長度不可超過20',
                },
                newTransPwd: {
                    required: '新交易密碼爲必填欄位',
                    minlength: '交易密碼為六位數字',
                    maxlength: '交易密碼為六位數字',
                    digits: '必須是數字',
                },
                confirmTransPwd: {
                    required: '確認交易密碼爲必填欄位',
                    equalTo: '請輸入相同的交易密碼',
                    minlength: '交易密碼為六位數字',
                    maxlength: '交易密碼為六位數字',
                    digits: '必須是數字',
                },
            },
            invalidHandler: function (event, validator) {

                swal({
                    'title': '欄位資料錯誤',
                    'text': '請更正錯誤欄位後再試一次',
                    'type': 'error',
                    confirmButtonText: 'OK'
                });

            },
            submitHandler: function (form) {
                $('#transpwdeditButton').attr('disabled', true);
                mApp.block('#transPwdedit-modal', {
                    size: 'lg',
                    type: 'loader',
                    state: 'primary',
                    message: '修改中...'
                });

                $.ajax({
                    type: 'POST',
                    url: '/home/account/misc/edit?tab=transPwd',
                    data: $(form).serialize(),
                    timout: 30000,
                    success: function (result) {
                        $('#transpwdeditButton').attr('disabled', false);
                        mApp.unblock('#transPwdedit-modal');

                        if (!result.err) {
                            swal({
                                title: '執行成功',
                                text: result.msg,
                                type: 'success',
                                confirmButtonText: 'OK'
                            }).then(function (result) {
                                // Reload page
                                location.reload();
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
                    error: function (xhr, textStatus, errorThrown) {

                        // Unblock button
                        $('#transpwdeditButton').attr('disabled', false);
                        mApp.unblock('#trnasPwdedit-modal');

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

        $('#imgedit-form').validate({
            rules: {
                /*name: {
                    required: true,
                    maxlength: 20
                },*/
            },
            messages: {
                /*name: {
                    required: '名稱爲必填欄位',
                    maxlength: '長度不可超過 20'
                },*/
            },
            invalidHandler: function (event, validator) {

                swal({
                    'title': '欄位資料錯誤',
                    'text': '請更正錯誤欄位後再試一次',
                    'type': 'error',
                    confirmButtonText: 'OK'
                });

            },
            submitHandler: function (form) {
                $('#imgeditButton').attr('disabled', true);
                mApp.block('#imgedit-modal', {
                    size: 'lg',
                    type: 'loader',
                    state: 'primary',
                    message: '修改中...'
                });

                let file = new FormData(document.getElementById('imgedit-form'));
                $.ajax({
                    type: 'POST',
                    url: '/home/account/misc/edit?tab=img',
                    contentType: false,
                    processData: false,
                    data: file,
                    timout: 30000,
                    success: function (result) {
                        $('#imgeditButton').attr('disabled', false);
                        mApp.unblock('#imgedit-modal');

                        if (!result.err) {   
                            swal({
                                title: '執行成功',
                                text: result.msg,
                                type: 'success',
                                confirmButtonText: 'OK'
                            }).then(function (result) {
                                // Reload page
                                location.reload();
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
                    error: function (xhr, textStatus, errorThrown) {

                        // Unblock button
                        $('#imgeditButton').attr('disabled', false);
                        mApp.unblock('#imgedit-modal');

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
        initForm: initForm,
    };
}();

jQuery(document).ready(function () {
    Misc.initForm();
});

function fillaccount() {
    document.getElementById('name').value = document.getElementById('showname').placeholder;
    document.getElementById('account').value = document.getElementById('showaccount').placeholder;
    document.getElementById('email').value = document.getElementById('showemail').placeholder;
    document.getElementById('phoneNumber').value = document.getElementById('showphoneNumber').placeholder;
};

function fillpwd() {
    document.getElementById('newpassword').value = '';
    document.getElementById('oldpassword').value = '';
    document.getElementById('confirmpassword').value = '';
}

function filltranspwd() {
    $(`#oldTransPwd`).val('');
    $(`#newTransPwd`).val('');
    $(`#confirmTransPwd`).val('');
}


