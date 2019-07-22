// Import
const   
    express = require('express'),
    exphbs  = require('express-handlebars'),
    bodyParser = require('body-parser'),
    cookieParser = require('cookie-parser'),
    compression = require('compression'),
    helmet = require('helmet');


async function runServer(){

    // Read .env into process.env if no env var is set
    require('dotenv').config();

    // Init
    const app = express();

    // Express Setting
    app.engine('handlebars', exphbs({
        defaultLayout: false,
        helpers : {
            section: function (name, options) { // helper used to manage sections in handlebar templates
                var helper = this;
                if (!this._sections) {
                    this._sections = {};
                    this._sections._get = function(arg){
                        if(typeof helper._sections[arg] === 'undefined'){
                            throw new Error('The section "' + arg + '" is required.');
                        }
                        return helper._sections[arg];
                    };
                }
                if(!this._sections[name]){
                    this._sections[name] = options.fn(this);
                }
                return null;
            }
        }
    }));
    app.set('view engine', 'handlebars');
    app.enable('trust proxy'); 

    // Static content middleware
    app.use('/home', express.static(__dirname + '/public/home')); // for static content request start like '/home', use static file in public/home

    // Other Middleware
    app.use(helmet()); // Secure HTTP header
    app.use(cookieParser());   
    app.use(bodyParser.json({limit: '50mb'}));
    app.use(bodyParser.urlencoded({ extended: true, limit: '50mb'}));
    app.use(compression()); // compress all responses

    // Logger init
    const logger = require('./libs/logger');
    logger.init(app);  // Now we can use req.db to access database connection instance

    // Session & Redis init
    const session = require('./libs/session');
    await session.init(app); // Now session based on redis is set, and we can use req.redis to access connection instance to redis server
    app.locals.logger.info(`Session intialized`);

    // Authorization init
    const auth = require('./libs/auth');
    auth.init(app); // must set up express-session before initializing passport
    app.locals.logger.info(`Authorization intialized`);

    // Database init
    const db = require('./libs/database');
    db.init(app); // Now we can use req.db to access database connection instance
    app.locals.logger.info(`Database intialized`);

    // AWS S3 init
    const s3 = require('./libs/s3');
    s3.init(app);
    app.locals.logger.info('S3 intialized');
    
    // Routes  
    const routes = require('./routes');
    routes.init(app);
    app.locals.logger.info(`Routes intialized`);

    // Start App
    var port = process.env.PORT || 8080;
    app.listen(port);
    app.locals.logger.info(`App server start listen on ${port} port`);
}

runServer();