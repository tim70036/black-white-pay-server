//== Class definition
var Dashboard = function() {

    //== Revenue Change.
    //** Based on Morris plugin - http://morrisjs.github.io/morris.js/
    var totalAvailChart = function() {

        // If doesn't exist just return
        if (!$('#totalAvailChart').length) return;
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

    var earningsSlide = function() {

        var $owl1 = $('.owl-carousel');
        var $owl2 = $('#m_widget_body_owlcarousel_items'); 

        // If doesn't exist just return
        if(!$owl1.length)  return;
        if(!$owl2.length)  return;


        $owl1.children().each( function( index ) {
            $(this).attr( 'data-position', index ); 
        });

        $owl2.owlCarousel({   
            rtl: mUtil.isRTL(),
            items: 1,            
            animateIn: 'fadeIn(100)',            
            loop: true, 
            // autoplay: true,
            // autoplayTimeout: 1000,  
            // autoplayHoverPause: true,                                           
        });
 
        $owl1.owlCarousel({
            rtl: mUtil.isRTL(),
            center: true,
            loop: true,
            items: 2,  
            // autoplay: true,
            // autoplayTimeout: 1000,  
            // autoplayHoverPause: true,        
        });

        $(document).on('click', '.carousel', function() {
            $owl1.trigger('to.owl.carousel', $(this).data( 'position' ) );
        });  
    }

    // Data table init function
    var initTable = function() {

            var table = $('#data-table');
            
            // If table doesn't exist just return
            if(!table.length)  return;

            var colMappings = {
                strSmallCover : 0,
                dpqName : 1,
                dpqId : 2,
                profit : 3,
                frozenBalance : 4,
                updatetime : 5,
            };

            // Init data table
            var oTable = table.DataTable({
                responsive: true,
                searchDelay: 500,

                // Data source
                ajax: {
                            url: '/home/dashboard/read/dpq',
                },

                //== Pagination settings
                dom: `
                <'row'<'col-sm-6 text-left'f>>
                <'row'<'col-sm-12'tr>>
                <'row'<'col-sm-12 col-md-5'i><'col-sm-12 col-md-7 dataTables_pager'lp>>`,

                order: [[colMappings.updatetime, 'desc']],

                // Column data
                        columns: [
                            {data: 'strSmallCover'},
                            {data: 'dpqName'},
                            {data: 'dpqId'},
                            {data: 'profit'},
                            {data: 'frozenBalance'},
                            {data: 'updatetime'}
                        ],

                columnDefs: [
                    {
                                targets: colMappings.strSmallCover,
                                responsivePriority : 0,
                                width: '30px',
                                //className: 'dt-right',
                                orderable: false,
                                render: function(data, type, full, meta) {
                                    return '<img src="'+data+'" alt="" class="clubCardPic">';
                                },
                    },
                    { targets: colMappings.dpqName, 	responsivePriority : 1, class : 'dt-center'	},
                    { targets: colMappings.dpqId, 	responsivePriority : 1, class : 'dt-center'	},
                    { targets: colMappings.profit, 	responsivePriority : 1, render: numberRender, class : 'dt-center'	},
                    { targets: colMappings.frozenBalance, responsivePriority : 1, render:froznumberRender, class: 'dt-center'},
                    { targets: colMappings.updatetime, 	responsivePriority : 1, class : 'dt-center'	},
                ],
        });

        // Function for rendering number colorful
        function numberRender(data, type, row, meta) {
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
        // Function for rendering froznumber colorful
        function froznumberRender(data, type, row, meta) {
            if(typeof data !== 'number') {
                return data;
            }
            if(data > 0){
                return '<span class="m--font-bold m--font-danger">' + data + '</span>';
            }
            else{
                return '<span class="m--font-bold m--font-info">' + data + '</span>';
            }
        }
    }
    
    
    // Function for rendering number colorful
    function changeNumColor() {
        $('.colorNum').each(function(){
            
            var num = $( this ).data('num');
            console.log(num)
            if(typeof num !== 'number') return;
            if( num > 0 ) $(this).addClass('m--font-info');
            else $(this).addClass('m--font-danger');
        });
    }
    

    return {
        //== Init demos
        init: function() {
            // init charts
            totalAvailChart();

            // earnings slide
            earningsSlide();

            // data table
            initTable();

            // rendering number colorful
            changeNumColor();
        }
    };
}();

//== Class initialization on page load
jQuery(document).ready(function() {
    Dashboard.init();
});