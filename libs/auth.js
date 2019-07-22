// Configure passport for express
const
    mysql = require('mysql'),
    sqlAsync = require('./sqlAsync'),
    util = require('./util'),
    passport = require('passport'), 
    passportLocalStrategy = require('passport-local').Strategy,
    moment = require('moment');

function init(app) {

    // Mapping user between session store <-> server <-> req.user
    // Particulary, serialized user in session <-> user instance req.user
    // http://toon.io/understanding-passportjs-authentication-flow/
    // Since we are using Redis, we choose to store the whole user object in redis
    // Thus no serialize and deserialize
    passport.serializeUser(function(user, done){ 
        // Serialize user instance to store in session storage, used for checking authentication for each request later
        done(null,user);
    });
    passport.deserializeUser(function(serializedUser, done){ 
        // deSerialize user instance, so passport can put it in req.user (after authentication of each request)
        done(null,serializedUser);
    });

    // Config each strategy
    configWebStrategy();
    configApiStrategy();

    // Initialize Passport and restore authentication state, if any, from the session.
    app.use(passport.initialize());
    app.use(passport.session());
}

function configWebStrategy() {
    passport.use('web-local', new passportLocalStrategy(
        // Set the field we want to process in the form
        {
            usernameField: 'account',
            passwordField: 'password',
            passReqToCallback: true // Let callback receive req
        },

        // Callback function, perform authorization
        async function(req, username, password, done) {

            // Encrypt password


            // Prepare query
            // Remeber to use charset utf8mb4_bin in DB
            let sqlString = `SELECT id, account, name, email, role, transPwd, imageSrc AS thumbnail
                            FROM UserAccount 
                            WHERE account=? AND password=?`;
            let values = [username, password];
            sqlString = mysql.format(sqlString, values);

            // Search user in database
            // Execute query
            try {
                let results = await sqlAsync.query(req.db, sqlString);

                // Not found user
                if (results.length <= 0) {

                    // Logger
                    req.logger.warn(`failed login using account[${username}] password[${password}]`);

                    return done(null, false);
                }

                // Arrive here only if user found
                let user = results[0];

                // Check role
                if (user.role !== 'admin' && user.role !== 'store' && user.role !== 'agent') return done(null, false);

                // Prepare data
                let targetTable = util.roleToTable(user.role);
                let targetUid = user.id;

                

                // Pepare query
                sqlString =`SELECT id
                            FROM ??
                            WHERE uid=?`;
                values = [targetTable, targetUid];
                sqlString = mysql.format(sqlString, values);

                // Search for the role id of this user
                results = await sqlAsync.query(req.db, sqlString);

                // Not found role id 
                if (results.length <= 0) {
                    return done(null, false);
                }

                // Init user info
                user.roleId = results[0].id;
                user.loginTime = moment.utc();
                user.connectionInfo = [];
                user.connectionInfo.unshift({
                    ip: req.ip, 
                    requestTime: moment.utc()
                });
                
                // return user object to passport
                return done(null, user); 
            }
            catch(error) {
                req.logger.error(error);
                return done(error);  
            }
        }
    ));
}

function configApiStrategy() {
    passport.use('api-local', new passportLocalStrategy(
        // Set the field we want to process in the form
        {
            usernameField: 'account',
            passwordField: 'password',
            passReqToCallback: true // Let callback receive req
        },

        // Callback function, perform authorization
        async function(req, username, password, done) {

            // Encrypt password


            // Prepare query
            // Remeber to use charset utf8mb4_bin in DB
            let sqlString = `SELECT id, account, name, email, role, imageSrc AS thumbnail
                            FROM UserAccount 
                            WHERE account=? AND password=?`;
            let values = [username, password];
            sqlString = mysql.format(sqlString, values);
            
            // Search user in database
            // Execute query
            try {
                let results = await sqlAsync.query(req.db, sqlString);

                // Not found user
                if (results.length <= 0) {
                    // Logger
                    req.logger.warn(`failed login using account[${username}] password[${password}]`);
                    return done(null, false);
                }

                // Arrive here only if user found
                let user = results[0];

                // Check role
                if (user.role !== 'member') return done(null, false);

                // Init user info
                // No role id
                user.loginTime = moment.utc();
                user.connectionInfo = [];
                user.connectionInfo.unshift({
                    ip: req.ip, 
                    requestTime: moment.utc()
                });
                
                // return user object to passport
                return done(null, user); 
            }
            catch(error) {
                req.logger.error(error);
                return done(error);  
            }
        }
    ));
}

module.exports = {
    init : init
};