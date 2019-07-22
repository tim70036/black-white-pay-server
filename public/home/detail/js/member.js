var deparam = function (querystring) {
  // remove any preceding url and split
  console.log("querystring : " + querystring);
  querystring = querystring.substring(querystring.indexOf('?')+1).split('&');
  console.log("after : " + querystring[0]);
  var params = {}, pair, d = decodeURIComponent;
  // march and parse
  for (var i = querystring.length - 1; i >= 0; i--) {
    pair = querystring[i].split('=');
    params[d(pair[0])] = d(pair[1] || '');
  }

  return params;
};

var MemberDetail = function() {
var pathname = window.location.href;
let querystring = deparam(pathname);
var oTable;

var colMappings = {
  strSmallCover : 0,
  dpqName : 1,
  dpqId : 2,
  profit : 3,
  frozenBalance : 4,
  updatetime : 5,
};


//== Revenue Change.
//** Based on Morris plugin - http://morrisjs.github.io/morris.js/
var totalAvailChart = function() {
    if ($('#totalAvailChart').length == 0) {
        return;
    }

    if(!chartData)  return;

    var data = [];
    // Push positive data if totalAvail > 0
    if(chartData.totalAvail > 0){
        if(chartData.cash >= 0) {
            data.push({
                label: "庫存寶石",
                value: chartData.cash,
                color:  mApp.getColor('accent'),
            });
        }
        if(chartData.remainCredit >= 0) {
            data.push({
                label: "剩餘信用",
                value: chartData.remainCredit,
                color:  mApp.getColor('danger'),
            });
        }
        if(chartData.belowTotalCash >= 0) {
            data.push({
                label: "下層庫存寶石",
                value: chartData.belowTotalCash,
                color:  mApp.getColor('brand'),
            });
        }
    }
    // Push negative data if totalAvail <= 0
    else {
        data.push({
            label: "寶石不足",
            value: chartData.totalAvail,
            color:  mApp.getColor('danger'),
        });
    }

    Morris.Donut({
        element: 'totalAvailChart',
        data: data,
    });
}

function numberColor() {
    $('.colorNum').each(function(){

        var num = $( this ).data('num');
        console.log(num)
        if(typeof num !== 'number') return;
        if( num > 0 ) $(this).addClass('m--font-info');
        else $(this).addClass('m--font-danger');
    });
}


function initForm() {

  $.validator.methods.float = function( value, element ) {
    return this.optional( element ) ||  $.isNumeric(value);
  }

  $('#edit-form').validate({
    rules: {
      ednickName: {
        required: true,
        maxlength: 20
      },
      edcredit: {
        number: true
      },
      eddiscountrate: {
        float: true,
        range: [-100, 100]
      },
      edline: {
        maxlength: 20
      },
      edwechat: {
        maxlength: 20
      },
      edfacebook: {
        maxlength: 20
      },
      edphone: {
        digits: true,
        maxlength: 20
      },
      edbankSymbol: {
        digits: true,
        maxlength: 20
      },
      edbankName: {
        maxlength: 20
      },
      edbankAccount: {
        digits: true,
        maxlength: 20
      },
      edcomment: {
        maxlength: 40
      }
    },
    messages: {
      ednickName: {
        required: '暱稱爲必填欄位',
        maxlength: '長度不可超過20'
      },
      edcredit: {
        number: '必須是整數'
      },
      eddiscountrate: {
        float: '必須是小數',
        range: '必須介於 -100 ～ 100',
      },
      edline: {
        maxlength: '長度不可超過 20'
      },
      edwechat: {
        maxlength: '長度不可超過 20'
      },
      edfacebook: {
        maxlength: '長度不可超過 20'
      },
      edphone: {
        digits: '必須是數字',
        maxlength: '長度不可超過 20'
      },
      edbankSymbol: {
        digits: '必須是數字',
        maxlength: '長度不可超過 20'
      },
      edbankName: {
        maxlength: '長度不可超過 20'
      },
      edbankAccount: {
        digits: '必須是數字',
        maxlength: '長度不可超過 20'
      },
      edcomment: {
        maxlength: '長度不可超過 40'
      }
    },
    invalidHandler: function(event, validator) {
        swal({
            "title" : "欄位資料錯誤",
            "text" : "請更正錯誤後再試一次",
            "type" : "error",
            confirmButtonText: "OK"
        });
    },
    submitHandler: function (form) {
      var pathname = window.location.href;
      let querystring = deparam(pathname);

      $('#submitButton').attr('disabled', true);
      mApp.block('#edit-form', {
          size: 'lg',
          type: 'loader',
          state: 'primary',
          message: '修改中...'
      });

      $.ajax({
          type: "POST",
          url: "/home/detail/member/edit?account="+querystring.account,
          data: $(form).serialize(), // serializes the form, note it is different from other AJAX in this module
          timout: 30000,
          success: function(result) {
              console.log(result);
              $('#submitButton').attr('disabled', false);
              mApp.unblock('#edit-form'); // Unblock button

              // Sweet alert
              if(!result.err) {

                  swal({
                      title: "執行成功",
                      text: "修改成功",
                      type: "success",
                      confirmButtonText: "OK"
                  }).then(function(result){
                                 // Reload page
                     location.reload();
                  });
              }
              else {
                  swal({
                      title: "執行失敗",
                      text: result.msg,
                      type: "error",
                      confirmButtonText: "OK"
                  });
              }
          },
          error: function(xhr, textStatus, errorThrown){

           // Unblock button
           $('#submitButton').attr('disabled', false);
           mApp.unblock('#edit-form');

           if(textStatus==="timeout") {
             swal({
               title: "執行失敗",
               text: "執行超時",
               type: "error",
               confirmButtonText: "OK"
             });
           }
           else{
             swal({
               title: "執行失敗",
               text: "執行失敗",
               type: "error",
               confirmButtonText: "OK"
             });
           }
         }
  });
}
});
}

return {
  init : function (){
      initForm();
      totalAvailChart();

      numberColor();
  }
};

}();

jQuery(document).ready(function() {
  MemberDetail.init();
  statusColor();
});

function statusColor() {
    var map = {
      'active' :   {'state': 'success', 'title' : '正常'},
      'frozen':    {'state': 'danger',  'title' : '凍結'},
      'undefined': {'state': 'metal',   'title' : '不明'},
    };
    var status = document.getElementById('status').innerHTML;
    console.log(status);
    if(typeof map[status] === 'undefined'){
      document.getElementById('status').value = '';
    }
    else{
      console.log(map[status].title);
      document.getElementById('status-dot').className = `m-badge m-badge--${map[status].state} m-badge--dot`;
      document.getElementById('status').className = `m-widget3__status m--font-${map[status].state}`;
      document.getElementById('status').innerHTML = map[status].title;
    }
};

function fillform(){
    $(`#ednickName`).val(nickNameTmp);
    document.getElementById('edcredit').value = document.getElementById('credit').innerHTML;
    document.getElementById('eddiscountrate').value = document.getElementById('discountRate').innerHTML;
    document.getElementById('edline').value = document.getElementById('line').innerHTML;
    document.getElementById('edwechat').value = document.getElementById('wechat').innerHTML;
    document.getElementById('edfacebook').value = document.getElementById('facebook').innerHTML;
    document.getElementById('edphone').value = document.getElementById('phone').innerHTML;
    document.getElementById('edbankSymbol').value = document.getElementById('bankSymbol').innerHTML;
    document.getElementById('edbankName').value = document.getElementById('bankName').innerHTML;
    document.getElementById('edbankAccount').value = document.getElementById('bankAccount').innerHTML;
    document.getElementById('edcomment').value = document.getElementById('comment').innerHTML;
}
