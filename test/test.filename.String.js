import test from 'ava'
import fs from 'fs'
import fss from '../index'

const IMAGE_FILENAME = './test/data/image.jpg'
const TEXT_FILENAME = './test/data/text'

let fsImage = null
let fsText = null

test.before('init', () => {
  fsImage = fss(IMAGE_FILENAME, { blockSize: 204800 })
  fsText = fss(TEXT_FILENAME, { blockSize: 204800 })
})

test.after('close', () => {
  fsImage = null
  fsText = null
})

test('should slice success', function * (t) {
  let readable = fsImage.slice()
  let tempFilename = './test/temp/string/slice_temp.jpg'

  return new Promise(function (resolve, reject) {
    let writable = fs.createWriteStream(tempFilename)

    writable.on('finish', () => {
      return resolve()
    })

    writable.on('error', (err) => {
      return reject(err)
    })

    readable.on('error', (err) => {
      return reject(err)
    })

    readable.pipe(writable)
  }).then(function () {
    t.is(fs.statSync(tempFilename).size, 204800)
    fs.unlinkSync(tempFilename)
  })
})

test('should sliceAsFile success', function * (t) {
  let tempFilename = './test/temp/string/sliceAsFile_temp.jpg'
  yield fsImage.sliceAsFile(tempFilename, {start: 0, end: 500000})

  t.is(fs.statSync(tempFilename).size, 500000)
  fs.unlinkSync(tempFilename)
})

test('should sliceAsFile by text success', function * (t) {
  let tempFilename = './test/temp/string/sliceAsFile_text_temp'

  yield fsText.sliceAsFile(tempFilename, {start: 0, end: 10})
  let data = fs.readFileSync(tempFilename, 'utf-8')

  t.is(data, "A\nA's\nAA's")
  t.is(fs.statSync(tempFilename).size, 10)

  fs.unlinkSync(tempFilename)
})

test('should sliceAsFile default interval success', function * (t) {
  let tempFilename = './test/temp/string/sliceAsFile_default_interval_temp.jpg'

  yield fsImage.sliceAsFile(tempFilename)

  t.is(fs.statSync(tempFilename).size, 204800)

  fs.unlinkSync(tempFilename)
})

test('should avgSliceAsFile success', function * (t) {
  let files = yield fsImage.avgSliceAsFile()

  t.is(files.length, 3)
  t.is(fs.statSync(files[0]).size, 204800)
  t.is(fs.statSync(files[1]).size, 204800)
  t.is(fs.statSync(files[2]).size, 107343)

  for (let file of files) {
    fs.unlinkSync(file)
  }
})

test('should join success', function * (t) {
  let tempFilename = './test/temp/string/join_temp'
  let res = yield fsText.avgSliceAsFile()
  let writable = fs.createWriteStream(tempFilename)

  yield fsText.join(res, writable)

  t.is(fs.statSync(TEXT_FILENAME).size, fs.statSync(tempFilename).size)

  let textData = fs.readFileSync(TEXT_FILENAME, 'utf-8')
  let tempData = fs.readFileSync(tempFilename, 'utf-8')

  t.is(textData, tempData)

  fs.unlinkSync(tempFilename)

  for (let file of res) {
    fs.unlinkSync(file)
  }
})

test('should joinAsFile success', function * (t) {
  let tempFilename = './test/temp/string/joinAsFile_temp'
  let res = yield fsText.avgSliceAsFile()

  yield fsText.joinAsFile(res, tempFilename)

  t.is(fs.statSync(TEXT_FILENAME).size, fs.statSync(tempFilename).size)

  let textData = fs.readFileSync(TEXT_FILENAME, 'utf-8')
  let tempData = fs.readFileSync(tempFilename, 'utf-8')

  t.is(textData, tempData)

  fs.unlinkSync(tempFilename)

  for (let file of res) {
    fs.unlinkSync(file)
  }
})
