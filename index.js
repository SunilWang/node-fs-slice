const fs = require('fs');
const path = require('path');
const async = require('async');
const crypto = require('crypto');
const merge = require('lodash.merge');

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
 * Gets the block's size [获取块的大小]
 * @param index The index of the block, index from 1 to a start [块的索引，索引从1开始]
 * @returns {{start: number, end: number}}
 * @private
 */
function getBlockInterval(index, blockSize){
    index = index <= 0 ? 1 : index;
    blockSize = blockSize || this.options.blockSize;

    let start = blockSize * (index - 1);
    let end = (blockSize * index) - 1;

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

function FsSlice(options) {
    this.options = merge({}, {
        blockSize: 204800, //200KB
        tmpPath: '/tmp/'
    }, options);
}

FsSlice.formatFilename = function (filename, index) {
    filename = filename.split('/').pop();
    index = index === undefined ? 1 : index;

    let random = crypto.randomBytes(16).toString('hex');
    let nowTime = Date.now();

    return new Buffer(index + filename + random + nowTime).toString('base64') + index + filename;
};

/**
 *
 * @param filename
 * @param options
 * @returns stream
 */
FsSlice.prototype.slice = function(filename, opts){
    if(!filename){
        throw new Error('require filename');
    }

    opts = (typeof opts) === 'object' ? opts : {};

    if(!opts.start) opts.start = 0;

    if(!opts.end){
        let blockSize = getBlockInterval.call(this, 1).end;
        let fileSize = fs.statSync(filename).size;

        opts.end = fileSize < blockSize ? fileSize : blockSize;
    }

    return fs.createReadStream(filename, opts);
};

FsSlice.prototype.sliceToFile = function (filename, filepath, rOptions, wOptions) {
    if(!filename || !filepath){
        throw new Error('require filename and filepath');
    }

    rOptions = (typeof rOptions) === 'object' ? rOptions : {};
    wOptions = (typeof wOptions) === 'object' ? wOptions : {};

    let readable = this.slice(filename, rOptions);

    return new Promise(function(resolve, reject) {
        let writable = fs.createWriteStream(filepath, wOptions);

        readable.pipe(writable);

        readable.on('end', function () {
            writable.end();

            return resolve();
        });

        readable.on('error', function (err) {
            return reject(err);
        });
    });
};

FsSlice.prototype.avgSliceToFile = function(filename, opts){
    opts = (typeof opts) === 'object' ? opts : {};

    let fsSlice = this;
    let blockSize = opts.blockSize || this.options.blockSize;
    let blockNum = getBlockNum.call(this, filename, blockSize);
    let tmpPath = opts.tmpPath || this.options.tmpPath;
    let index = opts.index || 1;
    let newFilePath = [];

    return new Promise(function(resolve, reject) {
        async.whilst(function () {
            return index <= blockNum;
        }, function (callback) {
            let newFilename = path.join(tmpPath, FsSlice.formatFilename(filename, index));
            let blockInterval = getBlockInterval.call(fsSlice, index, blockSize);

            fsSlice.sliceToFile(filename, newFilename, blockInterval)
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

FsSlice.prototype.together = function (filenameArray, filepath) {
    if(!isArray(filenameArray)){
        throw new Error('filenameArray must be an array');
    }

    for(let index in filenameArray){
        if(!fsExistsSync(filenameArray[index])){
            throw new Error(filenameArray[index] + ' file does not exist');
        }
    }

    let index = 0;
    let writable = fs.createWriteStream(filepath);

    return new Promise(function(resolve, reject) {
        async.whilst(function() {
            let is = index < filenameArray.length;

            if(!is){
                writable.end();
            }

            return is;
        }, function(callback){
            const readable = fs.createReadStream(filenameArray[index]);

            readable.pipe(writable, {end: false});
            readable.on("end", function() {
                index++;
                callback();
            });
        }, function (err) {
            if(err){
                return reject(err);
            }

            return resolve();
        });
    });
};

