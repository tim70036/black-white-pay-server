// Execute a sql string that allow using async/await
// Ex : 
// try {
//     let result = await sqlAsync.query(dbConneciton, sqlString);
// }
// catch(error)
// {

// }

let query = function( dbConneciton, sql ) {
    return new Promise(( resolve, reject ) => {
        dbConneciton.query(sql, ( err, rows) => {
            if ( err ) {
              reject( err );
            } else {
              resolve( rows );
            }
        });
    });
};
  
module.exports = { query };