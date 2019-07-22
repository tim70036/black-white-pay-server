const pm2 = require('pm2')

// Run server using PM2
pm2.connect(function(err) {
  if (err) {
    console.error(err)
    process.exit(2)
  }

  pm2.start({
    name: 'app',
    script: './app.js',
    instances: 'max',
    //output: './log/out.log',
    //error: './log/error.log',
    //args: ['redis-tunnel'],
    }, callback)
});

function callback(err, apps){
    pm2.disconnect();
    if (err) { throw err; }
}