const
    aws = require('aws-sdk'),
    multer = require('multer'),
    multerS3 = require('multer-s3'),
    mysql = require('mysql'),
    fs = require('fs'),
    sqlAsync = require('./sqlAsync');

aws.config.update({
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    region: process.env.AWS_REGION
});

const userDefaultThumnail = './public/img/user/user.png';
const storeDefaultAD = './public/img/storeAd/ad.png';

let s3 = new aws.S3();

async function init(app){
    app.use(function(req,res,next){
        req.s3 = s3;
        next();
    });
}

let upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.S3_BUCKET,
        acl: 'public-read',
        metadata: function (req, file, cb) {
            cb(null, {
                filedName: file.fieldname
            });
        },
        key: function (req, file, cb) {
            let newFileName = Date.now() + '-' + req.user.account;
            let fullPath = `${file.fieldname}/${newFileName}/${file.originalname}`;
            cb(null, fullPath);
        }
    })

});

let uploadUserDefaultThumbnail = ( req, account ) => {
    return new Promise(( resolve, reject ) => {
        const newFileName = `userImg/${Date.now()}-${account}-user.png`;
        fs.readFile(userDefaultThumnail, (err, data) => {
            if (err) throw err;
            const params = {
                Bucket: process.env.S3_BUCKET, // pass your bucket name
                Key: newFileName,
                ACL: 'public-read',
                Body: data
            };
            s3.upload(params, async function(s3Err, data) {
                if (s3Err) throw s3Err;
                try{
                    let sqlString = `UPDATE UserAccount
                        SET imageSrc=?, imageKey=?
                        WHERE account=?;`;
                    let values = [data.Location, data.key, account];
                    let sql = mysql.format(sqlString, values);
                
                    await sqlAsync.query(req.db, sql);
                    resolve(true);
                } catch(err) {
                    reject(err);
                }
            });
        });
    });
};

let uploadStoreAdDefaultImage = ( req, account ) => {
    return new Promise(( resolve, reject ) => {
        const newFileName = `adImg/${Date.now()}-${account}-ad.png`;
        fs.readFile(storeDefaultAD, (err, data) => {
            if (err) throw err;
            const params = {
                Bucket: process.env.S3_BUCKET, // pass your bucket name
                Key: newFileName,
                ACL: 'public-read',
                Body: data
            };
            s3.upload(params, async function(s3Err, data) {
                if (s3Err) throw s3Err;
                try{
                    let sqlString = `INSERT INTO Ad (storeId, title, imageSrc, imageKey)
                        VALUES (
                            (SELECT Store.id
                            FROM StoreInfo AS Store
                            INNER JOIN UserAccount AS U
                                ON Store.uid=U.id
                            WHERE U.account=?),
                            ?,
                            ?,
                            ?)
                            ;`;
                    let values = [account,'預設', data.Location, data.key];
                    let sql = mysql.format(sqlString, values);
                
                    await sqlAsync.query(req.db, sql);
                    resolve(true);
                } catch(err) {
                    reject(err);
                }
            });
        });
    });
};


module.exports = {
    init: init,
    upload: upload,
    uploadUserDefaultThumbnail: uploadUserDefaultThumbnail,
    uploadStoreAdDefaultImage: uploadStoreAdDefaultImage,
};