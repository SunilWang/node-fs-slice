var fs = require('fs');
var path = require('path');
var async = require('async');
var crypto = require('crypto');
var merge = require('lodash.merge');
var fdSlicer = require('fd-slicer');

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
        destPath: '/tmp/'
    }, options);

    this.fdPromise = FsSlice.openFs(filename);
    this.filename = filename;
}

FsSlice.formatFilename = function (filename, index) {
    filename = filename.split('/').pop();
    index = index === undefined ? 1 : index;

    return crypto.randomBytes(16).toString('hex') + index + filename;
};

FsSlice.openFs = function(filename) {
    return new Promise(function(resolve, reject) {
        fs.open(filename, 'r', function(err, fd) {
            if(err){
                return reject(err);
            }

            return resolve(fd);
        });
    });
};

/**
 *
 * @param opts
 * @returns {Promise.<stream>}
 */
FsSlice.prototype.slice = function(opts){
    opts = (typeof opts) === 'object' ? opts : {};

    if(opts.start === undefined){
        opts.start = 0;
    }

    if(opts.end === undefined){
        opts.end = getBlockInterval.call(this, 1).end;
    }

    return this.fdPromise.then(function (fd) {
        var slicer = fdSlicer.createFromFd(fd);

        return Promise.resolve(slicer.createReadStream(opts));
    }).catch(function (err) {
        return Promise.reject(err);
    });
};

FsSlice.prototype.sliceAsFile = function (filepath, rOptions, wOptions) {
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

            writable.on('finish', function () {
                return resolve();
            });
            writable.on('error', function (err) {
                return reject(err);
            });
        }).catch(function (err) {
            return reject(err);
        });
    });
};

FsSlice.prototype.avgSliceAsFile = function(opts){
    opts = (typeof opts) === 'object' ? opts : {};

    var fsSlice = this;
    var blockSize = opts.blockSize || this.options.blockSize;
    var blockNum = getBlockNum.call(this, this.filename, blockSize);
    var destPath = opts.destPath || this.options.destPath;
    var index = opts.index || 1;
    var newFilePath = [];

    return new Promise(function(resolve, reject) {
        async.whilst(function () {
            return index <= blockNum;
        }, function (callback) {
            var newFilename = path.join(destPath, FsSlice.formatFilename(fsSlice.filename, index));
            var blockInterval = getBlockInterval.call(fsSlice, index, blockSize);

            fsSlice.sliceAsFile(newFilename, blockInterval)
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

FsSlice.prototype.join = function (filenameArray, writable) {
    if(!isArray(filenameArray)){
        throw new Error('filenameArray must be an array');
    }

    for(var i in filenameArray){
        if(!fsExistsSync(filenameArray[i])){
            throw new Error(filenameArray[i] + ' file does not exist');
        }
    }

    var index = 0;

    return new Promise(function(resolve, reject) {

        writable.on('finish', function () {
            return resolve();
        });

        async.whilst(function() {
            var is = index < filenameArray.length;

            if(!is){
                writable.end();
                writable.destroy();
            }

            return is;
        }, function(callback){
            FsSlice.openFs(filenameArray[index]).then(function (fd) {
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
        });
    });
};

FsSlice.prototype.joinAsFile = function (filenameArray, filepath) {
    return this.join(filenameArray, fs.createWriteStream(filepath));
};

