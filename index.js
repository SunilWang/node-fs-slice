var fs = require('fs');
var path = require('path');
var async = require('async');
var crypto = require('crypto');
var merge = require('lodash.merge');
var fdSlicer = require('fd-slicer');

function openFs(filename) {
    return new Promise(function(resolve, reject) {
        fs.open(filename, 'r', function(err, fd) {
            if(err){
                return reject(err);
            }

            return resolve(fd);
        });
    });
}

function isArray(object){
    return Object.prototype.toString.call(object) === '[object Array]';
}

function fsExistsSync(path){
    try{
        fs.accessSync(path, fs.F_OK);
    }catch(e){
        return false;
    }
    return true;
}

/**
 *
 * Gets the block's size
 * @param index The index of the block, index from 1 to a start 
 * @returns {{start: number, end: number}}
 * @private
 */
function getBlockInterval(index, blockSize){
    index = index <= 0 ? 1 : index;
    blockSize = blockSize || this.options.blockSize;

    var start = blockSize * (index - 1);
    var end = blockSize * index;

    return {start, end};
}

function getBlockNum(filename, blockSize) {
    blockSize = blockSize || this.options.blockSize;

    return Math.ceil(fs.statSync(filename).size / blockSize);
}

/**
 * Expose `FsSlice`
 */

module.exports = FsSlice;

function FsSlice(filename, options) {
    if(!filename){
        throw new Error('require filename');
    }

    if((typeof filename) !== 'string'){
        throw new Error('filename must be a string');
    }

    this.options = merge({}, {
        blockSize: 204800, //200KB
        tmpPath: '/tmp/'
    }, options);

    this.fdPromise = openFs(filename);
    this.filename = filename;
}

FsSlice.formatFilename = function (filename, index) {
    filename = filename.split('/').pop();
    index = index === undefined ? 1 : index;

    var random = crypto.randomBytes(16).toString('hex');
    var nowTime = Date.now();

    return new Buffer(index + filename + random + nowTime).toString('base64') + index + filename;
};

/**
 *
 * @param opts
 * @returns {Promise.<stream>}
 */
FsSlice.prototype.slice = function(opts){
    opts = (typeof opts) === 'object' ? opts : {};

    if(opts.start === undefined) opts.start = 0;

    if(opts.end === undefined){
        var blockSize = getBlockInterval.call(this, 1).end;
        var fileSize = fs.statSync(this.filename).size;

        opts.end = fileSize < blockSize ? fileSize : blockSize;
    }

    return this.fdPromise.then(function (fd) {
        var slicer = fdSlicer.createFromFd(fd);

        return Promise.resolve(slicer.createReadStream(opts));
    }).catch(function (err) {
        return Promise.reject(err);
    });
};

FsSlice.prototype.sliceToFile = function (filepath, rOptions, wOptions) {
    if( !filepath){
        throw new Error('require filepath');
    }

    var FsSlice = this;

    rOptions = (typeof rOptions) === 'object' ? rOptions : {};
    wOptions = (typeof wOptions) === 'object' ? wOptions : {};

    return new Promise(function(resolve, reject) {
        FsSlice.slice(rOptions).then(function (readable) {
            var writable = fs.createWriteStream(filepath, wOptions);

            readable.pipe(writable);
            readable.on('end', function () {
                return resolve();
            });
            readable.on('error', function (err) {
                return reject(err);
            });
        }).catch(function (err) {
            return reject(err);
        });
    });
};

FsSlice.prototype.avgSliceToFile = function(opts){
    opts = (typeof opts) === 'object' ? opts : {};

    var fsSlice = this;
    var blockSize = opts.blockSize || this.options.blockSize;
    var blockNum = getBlockNum.call(this, this.filename, blockSize);
    var tmpPath = opts.tmpPath || this.options.tmpPath;
    var index = opts.index || 1;
    var newFilePath = [];

    return new Promise(function(resolve, reject) {
        async.whilst(function () {
            return index <= blockNum;
        }, function (callback) {
            var newFilename = path.join(tmpPath, FsSlice.formatFilename(fsSlice.filename, index));
            var blockInterval = getBlockInterval.call(fsSlice, index, blockSize);

            fsSlice.sliceToFile(newFilename, blockInterval)
                .then(function () {
                    newFilePath.push(newFilename);
                    index++;

                    return callback();
                });
        }, function (err) {
            if(err){
                return reject(err);
            }

            return resolve(newFilePath);
        });
    });
};

FsSlice.prototype.join = function (filenameArray, filepath) {
    if(!isArray(filenameArray)){
        throw new Error('filenameArray must be an array');
    }

    for(var index in filenameArray){
        if(!fsExistsSync(filenameArray[index])){
            throw new Error(filenameArray[index] + ' file does not exist');
        }
    }

    var index = 0;
    var writable = fs.createWriteStream(filepath);

    return new Promise(function(resolve, reject) {
        async.whilst(function() {
            var is = index < filenameArray.length;

            if(!is){
                writable.end();
            }

            return is;
        }, function(callback){
            openFs(filenameArray[index]).then(function (fd) {
                var slicer = fdSlicer.createFromFd(fd);
                var readable = slicer.createReadStream();

                readable.pipe(writable, {end: false});
                readable.on("end", function() {
                    index++;

                    callback();
                });
            }).catch(function (err) {
                return callback(err);
            });
        }, function (err) {
            if(err){
                return reject(err);
            }

            return resolve();
        });
    });
};

