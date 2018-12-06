var os = require('os')
var fs = require('fs')
var path = require('path')
var async = require('async')
var crypto = require('crypto')
var fdSlicer = require('fd-slicer')

/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @param value The value to check.
 * @returns {boolean} Returns `true` if `value` is an array, else `false`.
 * @private
 */
function isArray (value) {
  return Object.prototype.toString.call(value) === '[object Array]'
}

/**
 * Sync function, Check if the file exists
 *
 * @param path The path to check.
 * @returns {boolean} Returns `true` if `path` file exists, else `false`.
 * @private
 */
function fsExistsSync (path) {
  try {
    fs.accessSync(path, fs.F_OK)
  } catch (e) {
    return false
  }
  return true
}

/**
 * Gets the block's size
 * @param index of the block, `index` from 1 to a start
 * @param blockSize Size of the block
 * @returns {{start: number, end: number}}
 * @private
 */
function getBlockInterval (index, blockSize) {
  index = index <= 0 ? 1 : index
  blockSize = blockSize || this.options.blockSize

  var start = blockSize * (index - 1)
  var end = blockSize * index

  return {start, end}
}

/**
 * The size of the block, calculate the number of blocks
 * @param filename
 * @param blockSize Size of the block
 * @returns {number}
 */
function getBlockNum (filename, blockSize) {
  blockSize = blockSize || this.options.blockSize

  return Math.ceil(fs.statSync(filename).size / blockSize)
}

/**
 * Expose `FsSlice`
 */

module.exports = function (filename, opts) {
  if (!filename) {
    throw new Error('require filename')
  }

  if ((typeof filename) !== 'string') {
    throw new Error('filename must be a string')
  }

  if (!opts) opts = {}
  if (opts.blockSize === undefined) opts.blockSize = 204800 // 200kb
  if (opts.destPath === undefined) opts.destPath = os.tmpdir()
  if (opts.fd === undefined) opts.fd = fs.openSync(filename, 'r')

  return new FsSlice(filename, opts)
}

function FsSlice (filename, options) {
  this.options = options
  this.filename = filename
  this.fd = options.fd
}

// Format File Name
FsSlice.formatFilename = function (filename, index) {
  filename = filename.split('/').pop()
  index = index === undefined ? 1 : index

  return crypto.randomBytes(16).toString('hex') + '_' + index + '_' + filename
}

FsSlice.prototype.slice = function (opts) {
  opts = (typeof opts) === 'object' ? opts : {}

  if (opts.start === undefined) {
    opts.start = 0
  }

  if (opts.end === undefined) {
    opts.end = getBlockInterval.call(this, 1).end
  }

  var slicer = fdSlicer.createFromFd(this.fd)

  return slicer.createReadStream(opts)
}

FsSlice.prototype.sliceAsFile = function (filepath, rOptions, wOptions) {
  if (!filepath) {
    throw new Error('require filepath')
  }

  var self = this

  if (typeof rOptions !== 'object') rOptions = {}
  if (typeof wOptions !== 'object') wOptions = {}

  return new Promise(function (resolve, reject) {
    var writable = fs.createWriteStream(filepath, wOptions)

    writable.on('finish', function () {
      return resolve()
    })

    writable.on('error', function (err) {
      return reject(err)
    })

    self.slice(rOptions).pipe(writable)
  })
}

FsSlice.prototype.avgSliceAsFile = function (opts) {
  opts = (typeof opts) === 'object' ? opts : {}

  var self = this
  var blockSize = opts.blockSize || this.options.blockSize
  var blockNum = getBlockNum.call(this, this.filename, blockSize)
  var destPath = opts.destPath || this.options.destPath
  var index = opts.index || 1
  var newFilePath = []

  return new Promise(function (resolve, reject) {
    async.whilst(function () {
      return index <= blockNum
    }, function (callback) {
      var newFilename = path.join(destPath, FsSlice.formatFilename(self.filename, index))
      var blockInterval = getBlockInterval.call(self, index, blockSize)

      self
        .sliceAsFile(newFilename, blockInterval)
        .then(function () {
          newFilePath.push(newFilename)
          index++

          return callback()
        })
    }, function (err) {
      if (err) {
        return reject(err)
      }

      return resolve(newFilePath)
    })
  })
}

FsSlice.prototype.join = function (filenameArray, writable) {
  if (!isArray(filenameArray)) {
    throw new Error('filenameArray must be an array')
  }

  for (var i in filenameArray) {
    if (!fsExistsSync(filenameArray[i])) {
      throw new Error(filenameArray[i] + ' file does not exist')
    }
  }

  return new Promise(function (resolve, reject) {
    writable.on('finish', function () {
      return resolve()
    })

    writable.on('error', function (err) {
      return reject(err)
    })

    async.eachSeries(filenameArray, function (file, callback) {
      var filenameFd = fs.openSync(file, 'r')
      var slicer = fdSlicer.createFromFd(filenameFd)
      var readable = slicer.createReadStream()

      readable.on('end', function () {
        fs.closeSync(filenameFd)

        return callback()
      })

      readable.pipe(writable, {end: false})
    }, function (err) {
      if (err) {
        return reject(err)
      }

      writable.end()
      writable.destroy()
    })
  })
}

FsSlice.prototype.joinAsFile = function (filenameArray, filepath) {
  return this.join(filenameArray, fs.createWriteStream(filepath))
}
