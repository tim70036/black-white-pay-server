const
    moment = require('moment'),
    passport = require('passport'),
    { body, validationResult } = require('express-validator/check'),
    { sanitizeBody } = require('express-validator/filter');

let loginHandler = function(req,res, next) {
    const result = validationResult(req);
    // If the form data is invalid
    if (!result.isEmpty()) {
        // Return the first error to client
        let firstError = result.array()[0].msg;
        return res.json({ errCode: 1, msg: firstError });
    }

    // Use custom callback to send resposne to ajax request, since passport can't deal with ajax form by default
    passport.authenticate('web-local', function(err, user, info){
        // errCode 
        // 0 : auth success
        // 1 : auth failed
        // 2 : server error

        // Error occured
        if (err) { 
            return res.status(200).json({errCode : 2, msg: 'Server 錯誤'});
        }

        // Authentication failed
        if (!user) {
            return res.status(200).json({errCode : 1, msg: '帳號或密碼錯誤'});
        }

        // Authentication success, make passport logIn manually
        req.logIn(user, function(err) {
            if (err) return res.json({ errCode : 2, msg: 'Server 錯誤' });

            // Reset brute prevention
            req.brute.reset(function () {
                return res.json({ errCode : 0, msg: 'success'});
            });
        });

    })(req, res, next); // pass req, res, next into passport
};


let logoutHandler = function(req,res){
    // Using only req.logout is not sufficient
    req.session.destroy((err) => {
        if(err) return next(err);
        req.logout();
        res.redirect(303, '/');
    });
};
    

// Handler for authorization
let isLoginHandler = function(req, res, next){

    // User not login, just redirect
    if(!req.isAuthenticated()) {
        req.logger.verbose(`not logined, redirect to login page`);
        return res.redirect(303, '/home/login');
    }

    req.logger.verbose(`authorized, using account[${req.user.account}] role[${req.user.role}]`);
    // User has logined
    return next();
};

// Handler for recording conneciton info
let connectionInfoHandler = function(req, res, next){
    
    // Add user session data to res.locals for handlebars templating
    res.locals.user = {...req.user}; // must use spread operator... to make a copy, otherwise req.user will be changed
    // Translate role to Chinese
    let roleMapping = {
        'member' : '會員',
        'agent' : '代理',
        'store' : '店家',
        'admin' : '管理員',
    };
    res.locals.user.roleName = roleMapping[res.locals.user.role];

    // Set user role for rendering
    if(req.user.role === 'member')              res.locals.user.isMember = true;
    else if(req.user.role === 'agent')          res.locals.user.isAgent = true;
    else if(req.user.role === 'store')          res.locals.user.isStore = true;
    else if(req.user.role === 'admin')          res.locals.user.isAdmin = true;

    // Update req.user, and passport will store it back to Redis
    if(!req.user.connectionInfo) req.user.connectionInfo = [];
    req.user.connectionInfo.unshift({
        ip: req.ip, 
        requestTime: moment.utc(),
    });
    while(req.user.connectionInfo.length > 10)   req.user.connectionInfo.pop();  // Only record last 10 request

    return next();
}

// Generate a handler to authorize based on given input
let allowRole = function(...validRoles){
    return function(req, res, next){
        for(let i=0 ; i<validRoles.length ; i++){
            if(req.user.role === validRoles[i])
                return next(); // return if we find this user is allowed
        }

        // Not valid role
        req.logger.warn(`account[${req.user.account}] role[${req.user.role}] is not allowed to access`);

        // Return
        if(req.xhr){
            res.json({err: true, msg: '權限不足'});
        }
        else{
            return res.redirect(303, '/');
        }
    };
};

function loginValidator(){
    return [
        // All values must be string
        body('*')
            .isString().withMessage('Wrong data format'),

        // For each in data array
        body('account')
            .isLength({ min: 1 }).withMessage('帳號不可爲空')
            .isLength({ max: 20 }).withMessage('帳號長度不可超過 20')
            .isAlphanumeric().withMessage('帳號只能含有數字或英文字母'),
        body('password')
            .isLength({ min:8 }).withMessage('密碼長度至少為8')
            .isLength({ max:20 }).withMessage('密碼長度不可超過 20')
            .isAlphanumeric().withMessage('密碼只能含有數字或英文字母'),
        

        // Sanitize all values 
        sanitizeBody('*')
            .escape() // Esacpe characters to prevent XSS attack, replace <, >, &, ', " and / with HTML entities
            .trim(), // trim white space from both end 
    ];
}

module.exports = {
    login : loginHandler,
    loginValidate: loginValidator(),

    logout : logoutHandler,
    isLogin : isLoginHandler,
    connectionInfo : connectionInfoHandler,
    allowRole : allowRole,
};