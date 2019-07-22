const 
    winston = require('winston'),
    moment = require('moment');

function init(app){

    let logFormat;
    // Local development mode : print readable message to console
    // if(process.argv.includes('logger-console')){
    //     logFormat = function() {
    //         return winston.format.combine(
    //             winston.format.metadata(),
    //             winston.format.timestamp(),
    //             winston.format.printf(info => { return `${moment(info.timestamp).format('YYYY-MM-DD hh:mm:SS')}  [${info.level}] App Server: ${info.message}`; }),
    //         );
    //     };

    // }
     // AWS deployment mode : direct connect to cloudwatch
    // else {
    //     logFormat = winston.format.combine(
    //         winston.format.timestamp(),
    //         winston.format.json(),
    //     );
    // }


    // Create a  logger instance amd set to app.locals.logger, then we can use app.locals.logger
    app.locals.logger = winston.createLogger({

        level : 'debug',
        format:  winston.format.combine(
            winston.format.timestamp(),
            winston.format.printf(info => { return `${moment(info.timestamp).format('YYYY-MM-DD hh:mm:ss')}  App Server [${info.level}]: ${info.message}`; }),
        ),
        transports: [
            new winston.transports.Console(),
        ]
    });
    
    // Create a logger for each unique request
    // Then we can use req.logger to access logger in express
    // Also set up request logging
    app.use(function(req,res,next){
        
        // Asign id for each request
        req.id = req.ip;

        // Formater for logger
        let reqFormat = winston.format(info => {
            info.reqId = req.id;
            return info;
        });

        // Create logger
        req.logger = winston.createLogger({
            level : 'debug',
            format: winston.format.combine(
                winston.format.timestamp(),
                reqFormat(),
                winston.format.printf(info => { return `${moment(info.timestamp).format('YYYY-MM-DD hh:mm:ss')}  Request[${info.reqId}] [${info.level}]: ${info.message}`; }),
            ),
            transports: [
                new winston.transports.Console(),
            ]
        });
        
        // Log out request and respond info 
        req.logger.info(`=> "${req.method} ${req.path}"`);
        res.on('finish', function(){
            req.logger.info(`<= "${req.method} ${req.path}" status[${res.statusCode}]`);
        });

        next();
    });
}


module.exports = {
    init : init
};