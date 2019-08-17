// Export a router that is set with custom routes
// Import handlers for routes
const
    express = require('express'),
    {upload} = require('../libs/s3');

let router = express.Router();

// Extract handlers
const { dashboard, personnel, storeCurrency, mainCurrency, report, info, account, detail, login, auth } = require('../controllers/home');


// Check login
router.use(/^\/(dashboard|personnel|storeCurrency|mainCurrency|report|info|account|detail).*/, auth.isLogin); // used on all pages, except login

// User connection info
router.use(/^\/(dashboard|personnel|storeCurrency|mainCurrency|report|info|account|detail).*/, auth.connectionInfo); // used on all pages, except login

// Authorize personnel
// Special case : delete
router.use(/^\/personnel\/store\/delete.*/, auth.allowRole('admin'));
router.use(/^\/personnel\/agent\/delete.*/, auth.allowRole('admin'));
router.use(/^\/personnel\/member\/delete.*/, auth.allowRole('admin', 'store', 'agent'));
// General case : other operations
router.use(/^\/personnel\/store\/.*/, auth.allowRole('admin'));
router.use(/^\/personnel\/agent\/.*/, auth.allowRole('admin', 'store'));
router.use(/^\/personnel\/member\/.*/, auth.allowRole('admin', 'store', 'agent'));
router.use(/^\/personnel\/user\/.*/, auth.allowRole('admin'));
router.use(/^\/personnel\/verify\/.*/, auth.allowRole('store'));

// Authorize storeCurrency  
router.use(/^\/storeCurrency\/autoTransfer\/.*/, auth.allowRole('admin', 'store'));
router.use(/^\/storeCurrency\/transfer\/.*/, auth.allowRole('admin', 'store', 'agent', 'member'));
router.use(/^\/storeCurrency\/history\/.*/, auth.allowRole('admin', 'store', 'agent', 'member'));

// Authorize mainCurrency
router.use(/^\/mainCurrency\/transfer\/.*/, auth.allowRole('admin'));
router.use(/^\/mainCurrency\/history\/.*/, auth.allowRole('admin'));
router.use(/^\/mainCurrency\/exchange\/.*/, auth.allowRole('admin'));
router.use(/^\/mainCurrency\/exchange-history\/.*/, auth.allowRole('admin', 'store', 'agent'));

//Authorize report            
router.use(/^\/report\/revenue\/.*/, auth.allowRole('admin', 'store'));
      
//Authorize detail            
router.use(/^\/detail\/announcement\/.*/, auth.allowRole('admin'));
router.use(/^\/detail\/ad\/.*/, auth.allowRole('store'));
      
//Authorize info
router.use(/^\/info\/announcement\/.*/, auth.allowRole('admin'));
router.use(/^\/info\/ad\/.*/, auth.allowRole('store'));

//Authorize account
router.use(/^\/account\/retrieve\/.*/, auth.allowRole('admin', 'store'));

// Auth routes
router.post('/auth/login', auth.loginValidate, auth.login);
router.get('/auth/logout', auth.logout);

// Dashboard routes
router.get('/dashboard', dashboard.render);

// Login page routes
router.get('/login', login);

// Personnel management routes
const { store, agent, member, user, verify } = personnel;

router.get('/personnel/store/', store.render);
router.get('/personnel/agent/', agent.render);
router.get('/personnel/member/', member.render);
router.get('/personnel/user/', user.render);
router.get('/personnel/verify/', verify.render);

router.get('/personnel/store/read', store.read);
router.get('/personnel/agent/read', agent.read);
router.get('/personnel/verify/read', verify.read);

router.post('/personnel/store/create', store.createValidate, store.create);
router.post('/personnel/agent/create', agent.createValidate, agent.create);
router.post('/personnel/member/create', member.createValidate, member.create);
router.post('/personnel/user/create', user.createValidate, user.create);

router.post('/personnel/store/update', store.updateValidate, store.update);
router.post('/personnel/agent/update', agent.updateValidate, agent.update);
router.post('/personnel/member/update', member.updateValidate, member.update);
router.post('/personnel/user/update', user.updateValidate, user.update);

router.post('/personnel/store/delete', store.deleteValidate, store.delete);
router.post('/personnel/agent/delete', agent.deleteValidate, agent.delete);
router.post('/personnel/member/delete', member.deleteValidate, member.delete);

router.post('/personnel/member/search', member.searchValidate, member.search);
router.post('/personnel/user/search', user.searchValidate, user.search);

router.post('/personnel/verify/accept', verify.verifyAcceptValidate, verify.accept);
router.post('/personnel/verify/deny', verify.verifyDenyValidate, verify.deny);

// Credit management routes
const { transfer, history, autoTransfer } = storeCurrency;
router.get('/storeCurrency/transfer/', transfer.render);
router.post('/storeCurrency/transfer/transfer', transfer.transferValidate, transfer.transfer);

router.get('/storeCurrency/history/', history.render);
router.post('/storeCurrency/history/search', history.searchValidate, history.search);

router.get('/storeCurrency/autoTransfer/', autoTransfer.render);
router.post('/storeCurrency/autoTransfer/upload', autoTransfer.uploadValidate, autoTransfer.upload);


// MainCurrency management routes
const { mainTransfer, mainHistory, exchange, exchangeHistory } = mainCurrency;
router.get('/mainCurrency/transfer/', mainTransfer.render);
router.post('/mainCurrency/transfer/transfer', mainTransfer.transferValidate, mainTransfer.transfer);

router.get('/mainCurrency/history/', mainHistory.render);
router.post('/mainCurrency/history/search', mainHistory.searchValidate, mainHistory.search);

router.get('/mainCurrency/exchange/', exchange.render);
router.post('/mainCurrency/exchange/exchange',exchange.exchangeValidate, exchange.exchange);

router.get('/mainCurrency/exchange-history/', exchangeHistory.render);
router.post('/mainCurrency/exchange-history/search', exchangeHistory.searchValidate, exchangeHistory.search);

//Report management routes
const { expenditure } = report;

router.get('/report/expenditure/', expenditure.render);

router.post('/report/expenditure/search', expenditure.searchValidate, expenditure.search);

// Detail management routes
const { d_ad, d_announcement } = detail;
router.get('/detail/announcement/', d_announcement.renderValidate, d_announcement.render);

router.post('/detail/announcement/edit',
    upload.fields([{
        name: 'announcementImg',
        maxCount: 1
    }]),
    d_announcement.editValidate,
    d_announcement.edit);

router.get('/detail/ad/', d_ad.renderValidate, d_ad.render);
router.post('/detail/ad/edit',
    upload.fields([{
        name: 'adImg',
        maxCount: 1
    }]),
    d_ad.editValidate,
    d_ad.edit);

// Info management routes
const { announcement, ad, notification } = info;

router.get('/info/announcement/', announcement.render);
router.get('/info/announcement/read', announcement.read);
router.get('/info/ad/', ad.render);
router.get('/info/ad/read', ad.read);
router.get('/info/notification/', notification.render);
router.get('/info/notification/read', notification.read);

router.post('/info/announcement/create',
    upload.fields([{
        name: 'announcementImg',
        maxCount: 1
    }]),
    announcement.createValidate,
    announcement.create);

router.post('/info/announcement/delete', announcement.deleteValidate, announcement.delete);

router.post('/info/ad/create',
    upload.fields([{
        name: 'adImg',
        maxCount: 1
    }]),
    ad.createValidate,
    ad.create);
router.post('/info/ad/delete', ad.deleteValidate, ad.delete);

router.post('/info/notification/create', notification.createValidate, notification.create);
router.post('/info/notification/delete', notification.deleteValidate, notification.delete);


// Account management routes
const { misc } = account;

router.get('/account/misc/', misc.render);
router.post('/account/misc/edit', misc.editValidate, 
    upload.fields([{
        name: 'userImg',
        maxCount: 1
    }, {
        name: 'roleImg',
        maxCount: 1
    }, {
        name: 'currencyImg',
        maxCount: 1
    }]), misc.edit);

module.exports = router;
