// Make Express use several custom routers
// Import differnt routers
const
    homeRoute = require('./home'),
    apiRoute = require('./api'),
    gameRoute = require('./game');

 // Make Express use these routers
function init(app) {

    // Index page is /home/dashboard
    app.get('/', function (req, res) {
        res.redirect('/home/dashboard');
    });

     // Make Express use these routers
    app.use('/home', homeRoute);
    app.use('/api', apiRoute);
    app.use('/game', gameRoute);

    // Invalid url path
    app.use(function(req, res, next) {
        let err = new Error(`${req.ip} tried to reach ${req.originalUrl}`);
        err.statusCode = 404;
        err.userMessage = `${req.originalUrl} is an invalid url.`;
        next(err);
    });

    // Specific /api Error Handling
    app.use('/api', function(err, req, res, next) {
        req.logger.error(err.message);
        return res.json({ errCode: 1, msg: err.userMessage });
    });

    // General Error Handling
    app.use(function(err, req, res, next) {
        
        req.logger.error(err.message);
        
        if (!err.statusCode) err.statusCode = 500; // Sets a generic server error status code if none is part of the err
 
        if (req.xhr) {
            return res.json({
                errCode: 1, // API format
                err: true, // Web old format
                msg: err.userMessage
            });
        } else {
            return res.render('home/error', {error : err}); // Renders a my error page for the user
        } 
    });
      

}

module.exports = {
    init: init
};