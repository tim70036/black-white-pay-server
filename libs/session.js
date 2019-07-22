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

    // Set connection instance to req.redis
    // Then we can use req.redis to access redis connection instance in express
    app.use(function(req,res,next){
        req.redis = client;
        next();
    });




    // Express-session
    // Config express to use express-session based on redis store
    let sessionStore = new redisStore({ client : client });
    app.use(session({
        store: sessionStore, // use redis store
        secret: process.env.SESS_KEY, // key for encrypting signed cookie
        resave: false,
        saveUninitialized: false,
        cookie: {maxAge: 12 * 3600000}, // session will expire after 12 hours
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
    // Init, at most 30 req in 30 sec
    let brute = new expressBrute(bruteStore, {
        freeRetries: 30,  // The valid number of request from the user before they need to start waiting
        minWait: 30*1000, // 30 sec
        maxWait: 30*1000, // 30 sec
        lifetime: 30,     // The length of time (in seconds since the last request) to remember the number of requests that have been made by an IP. 
        attachResetToRequest: false,
        refreshTimeoutOnRequest: false,  // Defines whether the lifetime counts from the time of the last request that ExpressBrute didn't prevent for a given IP (true) or from of that IP's first request (false)
        failCallback : failCallback,
        handleStoreError : handleStoreError,
    });

    // Config express to use Express-brute
    app.use(brute.prevent);
}

let failCallback = function (req, res, next) {
    req.logger.warn(`${req.ip} made too many request in a short period of time, now blocked`);
    
    let error = {
        statusCode : 404,
        message : '操作次數過多, 請稍後再試',
    };
    res.render('home/error',{error: error}); // brute force protection triggered
};

let handleStoreError = function (error) {
    //log.error(error); // log this error so we can figure out what went wrong
    // cause node to exit, hopefully restarting the process fixes the problem
    throw Error('bruteStore failed');
};

module.exports = {
    init : init
}
