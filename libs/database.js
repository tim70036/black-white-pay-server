// Configure database for express
const
    mysql = require('mysql'),
    {promisify} = require('util');

function init(app) {

    // Connect to database
    let pool = mysql.createPool({

        host     : process.env.DB_HOST,
        user     : process.env.DB_USER,
        password : process.env.DB_PWD,
        database : process.env.DB_NAME,

        connectionLimit : 20,
        waitForConnections : true,
        timezone : process.env.DB_TZ,
        multipleStatements: true,
        charset : 'utf8mb4',
    });

    app.locals.logger.info(`MySQL connected to ${process.env.DB_HOST} on port[3306] schema[${process.env.DB_NAME}]`);
    
    // Pool event
    pool.on('connection', function (connection) {
        app.locals.logger.debug(`MySQL connection ${connection.threadId} is created by connection pool`);
    });

    pool.on('acquire', function (connection) {
        app.locals.logger.debug(`MySQL connection ${connection.threadId} acquired from connection pool`);
    });

    pool.on('release', function (connection) {
        app.locals.logger.debug(`MySQL connection ${connection.threadId} released, return to connection pool`);
    });

    pool.on('enqueue', function () {
        app.locals.logger.debug(`MySQL query waiting for available connection slot`);
    });

    
    // Promisfy
    pool.getConnection = promisify(pool.getConnection);

    // Attain a connection from pool and attach it to req
    // Then we can use req.db to access database connection pool in express
    app.use(async function(req,res,next){

        try {
            let sqlConnection = await pool.getConnection();
            req.db = sqlConnection;
            next();
        } catch (error) {
            next(error);
        }
        
        // Release connection back to pool when the response has been sent.
        res.on('finish', function() {
            req.db.release();
        });

    });
}



module.exports = {
    init : init
};