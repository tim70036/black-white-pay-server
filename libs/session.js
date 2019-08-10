const   
    redis = require('redis'),
    redisSsh = require('redis-ssh'),
    session = require('express-session'),
    uuid = require('uuid/v4'),
    redisStore = require('connect-redis')(session),
    {promisify} = require('util'),
    expressBrute = require('express-brute'),
    expressBruteStore = require('express-brute-redis');

async function init(app){

    // Redis
    // Connect to redis
    let client; 
    // Local development mode : use ssh tunnel to connect elasticache
    if(process.argv.includes('redis-tunnel')){
        app.locals.logger.info(`Using SSH tunnel ${process.env.EC2_HOST} to connect redis`);
        let ssh = await redisSsh.connect(
            {
                host: process.env.EC2_HOST,
                user: 'ec2-user',
                privateKey: require('fs').readFileSync(require('path').resolve(__dirname, '../configs/tim.pem')),
            },
            {
                host: process.env.REDIS_HOST,
                port: process.env.REDIS_PORT,
                db:  process.env.REDIS_DB,
                no_ready_check : true,
            }
        );
        client = ssh.client;
    }
    // AWS deployment mode : direct connect to elasticache
    else{
        client = redis.createClient({
            host: process.env.REDIS_HOST,
            port: process.env.REDIS_PORT,
            db:  process.env.REDIS_DB,
            no_ready_check : true,
        });
    }

    // Set Redis logging function
    client.on('connect', function() {
        app.locals.logger.info(`Redis connected to ${process.env.REDIS_HOST} on port[${process.env.REDIS_PORT}] DB[${process.env.REDIS_DB}]`);
    });

    client.on('error', function (err) {
        app.locals.logger.error(`Redis error : ${err}`);
    });

    client.on('reconnecting', function () {
        app.locals.logger.info(`Redis client reconnecting`);
    });

    // Promisified redis client
    client.getAsync = promisify(client.get).bind(client);
    client.setAsync = promisify(client.set).bind(client);
    client.delAsync = promisify(client.del).bind(client);
    client.getListAsync = promisify(client.lrange).bind(client);
    client.existsAsync = promisify(client.exists).bind(client);

    // Set connection instance to req.redis
    // Then we can use req.redis to access redis connection instance in express
    app.use(function(req,res,next){
        req.redis = client;
        next();
    });

    // Express-session
    // Config express to use express-session based on redis store
    let sessionStore = new redisStore({ client : client });

    // Session on all route except /api... 
    app.use(/^(?!\/api).*$/, session({
        store: sessionStore, // use redis store
        secret: process.env.SESS_KEY, // key for encrypting signed cookie
        resave: false,
        saveUninitialized: false,
        cookie: {maxAge: 24 * 3600000}, // session will expire after 24 hours
        genid: (req) => {
            return uuid(); // use UUIDs for session IDs
        }
    }));
    // Session on /api route
    app.use(/^\/api.*$/, session({
        store: sessionStore, // use redis store
        secret: process.env.SESS_KEY, // key for encrypting signed cookie
        resave: false,
        saveUninitialized: false,
        cookie: {maxAge: 7 * 24 * 3600000}, // session will expire after 7 days
        genid: (req) => {
            return uuid(); // use UUIDs for session IDs
        }
    }));


    // Express-brute (Rate Limiter)
    // Use redis store
    let bruteStore = new expressBruteStore({ 
        client : client,
        prefix : 'reqInfo:',
    });

    // General prevention for same IP
    let globalBrute = new expressBrute(bruteStore, {
        freeRetries: 30,  // The valid number of request from the user before they need to start waiting
        // Begin to wait from last request 
        minWait: 10*60*1000, // 10 min
        maxWait: 10*60*1000, // 10 min
        lifetime: 30,     // Start from first request. After this period of time(sec), the record will be gone and the record of this IP can start over again (reset request count to 0 and wait time to minWait)
        attachResetToRequest: false,
        refreshTimeoutOnRequest: false,  // Defines whether the lifetime counts from the time of the last request that ExpressBrute didn't prevent for a given IP (true) or from of that IP's first request (false)
        failCallback : globalFailCallback,
        handleStoreError : handleStoreError,
    });

    // Auth prevention for same IP + same account
    let authBrute = new expressBrute(bruteStore, {
        freeRetries: 3,
        minWait: 3*60*1000, // 3 minutes
        maxWait: 12*60*60*1000, // 12 hour
        lifetime: 24*60*60, // 1 day
        failCallback: authFailCallback,
        handleStoreError: handleStoreError
    });

    // Config express to use Express-brute on different routes
    // Use on all route except /game/...
    app.use(/^(?!\/game).*$/, globalBrute.prevent); 
    // Use on auth route, stricter prevent
    app.use(/^((\/home\/auth\/login)|(\/api\/auth\/login))/, authBrute.getMiddleware({
        key: function(req, res, next) {
            // prevent too many attempts for the same account
            // reset when login success
            next(req.body.account);
        }
    })); 
}

let globalFailCallback = function (req, res, next) { 
    let err = new Error(`${req.ip} made too many request in a short period of time, now blocked`);
    err.statusCode = 429;
    err.userMessage = `操作次數過多, 請稍後再試`;
    next(err); // Let error handling contoller deal with this 
};

let authFailCallback = function (req, res, next) { 
    let err = new Error(`${req.ip} login failed with account[${req.body.account}] too many times in a short period of time, now blocked`);
    err.statusCode = 429;
    err.userMessage = `登入失敗次數過多, 請稍後再試`;
    next(err); // Let error handling contoller deal with this 
};

let handleStoreError = function (error) {
    //log.error(error); // log this error so we can figure out what went wrong
    // cause node to exit, hopefully restarting the process fixes the problem
    throw Error('bruteStore failed');
};

module.exports = {
    init : init
}
