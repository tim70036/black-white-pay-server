var PortletTools = function () {
    //== Toastr
    var initToastr = function() {
        toastr.options.showDuration = 1000;
        
    }

 

    return {
        //main function to initiate the module
        init: function () {
            initToastr();
        }
    };
}();

jQuery(document).ready(function() {
    PortletTools.init();
    
});
