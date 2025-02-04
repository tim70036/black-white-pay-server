// Export a router that is set with custom routes
// Import handlers for routes
const
    express = require('express'),
    { upload } = require('../libs/s3');

let router = express.Router();

// Extract handlers
const { auth, user, info, store, wallet, friend, game } = require('../controllers/api');

// Check login
router.use(/^\/(user|info|store|wallet|friend|game).*/, auth.isLogin); // used on all routes, except auth

// Register routes to a router
// Auth routes
router.post('/auth/register/push-phone', auth.registerPushPhoneValidate, auth.pushPhone);
router.post('/auth/register/verify-phone', auth.verifyPhoneValidate, auth.verifyPhone);
router.post('/auth/register/register', auth.registerValidate, auth.register);
router.post('/auth/login', auth.loginValidate, auth.login);
router.get('/auth/logout', auth.logout);

router.post('/auth/forget/push-phone', auth.forgetPushPhonerValidate, auth.pushPhone);
router.post('/auth/forget/verify-phone', auth.verifyPhoneValidate, auth.verifyPhone);
router.post('/auth/forget/forget', auth.forgetValidate, auth.forget);

// User routes
router.post('/user/update/name', user.changeNameValidate, user.changeName);
router.post('/user/update/pwd', user.changePwdValidate, user.changePwd);
router.post('/user/update/transpwd', user.changeTransPwdValidate, user.changeTransPwd);
router.post('/user/update/thumbnail',
    upload.fields([{
        name: 'userImg',
        maxCount: 1
    }]), user.changeThumbnail);
router.get('/user/preload-uri', user.preloadUri);
router.get('/user/qr-re-fav', user.qrReFavList);
router.post('/user/qr-re-fav/add', user.addQrReFavValidate, user.addQrReFav);
router.post('/user/qr-re-fav/delete', user.deleteQrReFavValidate, user.deleteQrReFav);


// Info routes
router.get('/info/announement/list', info.announementList);
router.get('/info/notification/list', info.notitficationList);
router.post('/info/notification/push-token', info.pushTokenValidate, info.pushToken);

// Store routes
router.get('/store/list', store.list);
router.post('/store/ad', store.adValidate, store.ad);
router.post('/store/bind', store.bindValidate, store.bind);
router.post('/store/comment', store.commentValidate, store.comment);

// Wallet routes
router.get('/wallet/list', wallet.list); 
router.post('/wallet/transfer', wallet.transferValidate, wallet.transfer);
router.post('/wallet/history', wallet.historyValidate, wallet.history);
router.post('/wallet/exchange', wallet.exchangeValidate, wallet.exchange);

// Friend routes
router.get('/friend/list', friend.list);
router.post('/friend/detail', friend.detailValidate, friend.detail);
router.post('/friend/delete', friend.deleteValidate, friend.delete);

router.get('/friend/invitation/list', friend.invitation.list);
router.post('/friend/invitation/accept', friend.invitation.acceptValidate, friend.invitation.accept); 
router.post('/friend/invitation/decline', friend.invitation.declineValidate, friend.invitation.decline);

router.get('/friend/request/list', friend.request.list);
router.post('/friend/request/create', friend.request.createValidate, friend.request.create);
router.post('/friend/request/cancel', friend.request.cancelValidate, friend.request.cancel);

// Game routes
router.get('/game/wallet/list', game.wallet.list);
router.post('/game/wallet/take-in-and-play', game.wallet.takeInValidate, game.wallet.takeInAndPlayHandler);
router.post('/game/wallet/take-out', game.wallet.takeOutValidate, game.wallet.takeOut);
router.post('/game/wallet/take-out-all', game.wallet.takeOutAll);
router.post('/game/game-list/list', game.gameList.gameListValidate, game.gameList.gameList);

module.exports = router;
