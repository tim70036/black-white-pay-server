module.exports = {
    apps : [{
        name: 'app',
        script: './app.js',
        instances: 'max',
        //max_memory_restart : "500M", // prevent memory leak
        //output: './log/out.log',
        //error: './log/error.log',
    }]
}