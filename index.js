var os = require('os')
var fs = require('fs')
var path = require('path')
var async = require('async')
var crypto = require('crypto')
var fdSlicer = require('fd-slicer')
var assign = require('lodash.assign')
var DEFAULT_BLOCK_SIZE = 204800 // 200kb

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
    return fs.statSync(path).isFile()
  } catch (e) {
    return false
  }
}

var DEFAULT_OPTIONS = {
  blockSize: DEFAULT_BLOCK_SIZE,
  destPath: os.tmpdir(),
  filename: Date.now() + ''
}

function FsSlice (filename, opts) {
  if (!filename) {
    throw new Error('require filename')
  }

  if (typeof filename !== 'string' && !Buffer.isBuffer(filename)) {
    throw new Error('filename must be a string or Buffer')
  }

  if (!opts) opts = {}
  this.OPTIONS = assign(DEFAULT_OPTIONS, opts)

  if (typeof filename === 'string') {
    try {
      var stat = fs.statSync(filename)
      if (!stat.isFile()) throw new Error(`no such file, stat '${filename}'`)
      this.slicer = fdSlicer.createFromFd(fs.openSync(filename, 'r'))
      this.filename = filename
      this.filesize = stat.size
    } catch (e) {
      throw e
    }
  } else {
    this.filename = this.OPTIONS.filename
    this.filesize = filename.length
    this.slicer = fdSlicer.createFromBuffer(filename)
  }
}

/**
 * Gets the block's size
 * @param index of the block, `index` from 1 to a start
 * @param blockSize Size of the block
 * @returns {{start: number, end: number}}
 * @private
 */
FsSlice.prototype._getBlockInterval = function (index, blockSize) {
  index = index <= 0 ? 1 : index
  blockSize = blockSize || this.OPTIONS.blockSize

  var start = blockSize * (index - 1)
  var end = blockSize * index

  return {start, end}
}

/**
 * The size of the block, calculate the number of blocks
 * @returns {number}
 */
FsSlice.prototype._getBlockNum = function () {
  return Math.ceil(this.filesize / this.OPTIONS.blockSize)
}

FsSlice.prototype.formatFilename = function (index) {
  var filename = this.filename.split('/').pop()
  index = index === undefined ? 1 : index

  return crypto.randomBytes(16).toString('hex') + '_' + index + '_' + filename
}

FsSlice.prototype.slice = function (opts) {
  if (!opts) opts = {}
  opts = assign({
    start: 0,
    end: this._getBlockInterval(1).end
  }, opts)

  return this.slicer.createReadStream(opts)
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
  var blockNum = this._getBlockNum()
  var newFilePath = []
  var index = opts.index || 1

  return new Promise(function (resolve, reject) {
    async.whilst(function () {
      return index <= blockNum
    }, function (callback) {
      var newFilename = path.join(self.OPTIONS.destPath, self.formatFilename(index))
      var blockInterval = self._getBlockInterval(index, self.OPTIONS.blockSize)

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

  if (!filenameArray.length) {
    throw new Error('filenameArray is empty')
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

/**
 * Expose `FsSlice`
 */
module.exports = function (filename, opts) {
  return new FsSlice(filename, opts)
}
