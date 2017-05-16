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

    this.filename = filename;
    this.fd = fs.openSync(this.filename, 'r');
}

FsSlice.formatFilename = function (filename, index) {
    filename = filename.split('/').pop();
    index = index === undefined ? 1 : index;

    return crypto.randomBytes(16).toString('hex') + index + filename;
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

    var slicer = fdSlicer.createFromFd(this.fd);

    return slicer.createReadStream(opts);
};

FsSlice.prototype.sliceAsFile = function (filepath, rOptions, wOptions) {
    if( !filepath){
        throw new Error('require filepath');
    }

    var FsSlice = this;

    rOptions = (typeof rOptions) === 'object' ? rOptions : {};
    wOptions = (typeof wOptions) === 'object' ? wOptions : {};

    return new Promise(function(resolve, reject) {
        var writable = fs.createWriteStream(filepath, wOptions);


        writable.on('finish', function () {
            return resolve();
        });

        writable.on('error', function (err) {
            return reject(err);
        });

        FsSlice.slice(rOptions).pipe(writable);
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
            var filenameFd = fs.openSync(filenameArray[index], 'r');
            var slicer = fdSlicer.createFromFd(filenameFd);
            var readable = slicer.createReadStream();

            readable.on("end", function() {
                index++;
                fs.closeSync(filenameFd);

                return callback();
            });

            readable.pipe(writable, {end: false});
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

FsSlice.prototype.close = function () {
    return fs.closeSync(this.fd);
};