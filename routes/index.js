// Make Express use several custom routers
// Import differnt routers
const
    homeRoute = require('./home'),
    apiRoute = require('./api');

 // Make Express use these routers
function init(app) {

    // Index page is /home/dashboard
    app.get('/', function (req, res) {
        res.redirect('/home/dashboard');
    });

     // Make Express use these routers
    app.use('/home', homeRoute);
    app.use('/api', apiRoute);

    // Error Handling
    app.use(function(req, res, next) {
        let err = new Error(`${req.ip} tried to reach ${req.originalUrl}`); // Tells us which IP tried to reach a particular URL
        err.statusCode = 404;
        err.shouldRedirect = true; //New property on err so that our middleware will redirect
        next(err);
    });

    app.use(function(err, req, res, next) {
        
        req.logger.error(err.message);
        
        if (!err.statusCode) err.statusCode = 500; // Sets a generic server error status code if none is part of the err
      
        if (err.shouldRedirect) {
            let error = {
                statusCode : err.statusCode,
                message : `${req.originalUrl} is an invalid url.`,
            }
            res.render('home/error', {error : error}); // Renders a my error page for the user
        } else {
          res.status(err.statusCode).send(err.message); // If shouldRedirect is not defined in our error, sends our original err data
        }
    });
      

}

module.exports = {
    init: init
};