var Retrieve = function(){
    function initButton(){
        $(`#send`).click(function(e){
            e.preventDefault();
            let targetId = $(`#memberId`).val();
            if(targetId === ''){
                swal({
                    'title': '欄位資料錯誤',
                    'text': '會員帳號為必填欄位',
                    'type': 'error',
                    confirmButtonText: 'OK'
                });
                return;
            }
            if(!targetId.match(/^[0-9a-zA-Z]+$/)){
                swal({
                    'title': '欄位資料錯誤',
                    'text': '會員帳號必須是數字或英文字母',
                    'type': 'error',
                    confirmButtonText: 'OK'
                });
                return;
            }
            swal({
                title: `确定重置會員${targetId}密碼 ?`,
                text: '重置後密碼及交易密碼將會變更 是否確定重置？',
                type: 'warning',
                showCancelButton: true,
                confirmButtonText: '确定重置',
                cancelButtonText: '取消',
                reverseButtons: true
            }).then(function(result){
                if (result.value){
                    $('#send').attr('disabled', true);
                    mApp.block('.m-content', {
                        size: 'lg',
                        type: 'loader',
                        state: 'primary',
                        message: '新增中...'
                    });

                    $.ajax({
                        type: 'POST',
                        url: '/home/account/retrieve/update',
                        data: {'memberId': targetId},
                        timout: 30000,
                        success: function(result){
                            $('#send').attr('disabled', false);
                            mApp.unblock('.m-content');

                            if(!result.err){
                            // [TODO] 
                            swal({
                                title: '執行成功',
                                text: `密碼及交易密碼已重置，請提醒該人員登入後進行修改`,
                                type: 'success',
                                confirmButtonText: 'OK'
                            });
                            $(`#pwd`).html(result.data.pwd);
                            $(`#transPwd`).html(result.data.transPwd);
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
                        error: function(xhr, textStatus, errorThrown){
                            $('#send').attr('disabled', false);
                            mApp.unblock('.m-content'); // Unblock 

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
        });

        $(`#reset`).click(function(){
            swal({
                title: `确定重置欄位?`,
                text: '重置欄位後，右側之密碼及交易密碼將會清空，請確認已記錄',
                type: 'warning',
                showCancelButton: true,
                confirmButtonText: '确定重置欄位',
                cancelButtonText: '取消',
                reverseButtons: true
            }).then(function(result){
                if (result.value){
                    $(`#memberId`).val('');
                    $(`#pwd`).html('');
                    $(`#transPwd`).html('');
                }
            })
        });
    }

    function init(){
        initButton();
    }

    return {
        init : init,
    };
}();

jQuery(document).ready(function() {
    Retrieve.init();
});