import test from 'ava'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const fss = require('..')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const IMAGE_FILENAME = path.join(__dirname, 'data', 'image.jpg')
const TEXT_FILENAME = path.join(__dirname, 'data', 'text')
const TEMP_DIR = path.join(__dirname, 'temp', 'string')

const DEFAULT_BLOCK_SIZE = 204800

let fsImage
let fsText

function cleanupDir (dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir)) {
    fs.unlinkSync(path.join(dir, entry))
  }
}

function ensureDir (dir) {
  fs.mkdirSync(dir, { recursive: true })
}

test.before('初始化文件实例', t => {
  fsImage = fss(IMAGE_FILENAME, { blockSize: DEFAULT_BLOCK_SIZE })
  fsText = fss(TEXT_FILENAME, { blockSize: DEFAULT_BLOCK_SIZE })
  ensureDir(TEMP_DIR)
  t.pass()
})

test.after.always('清理临时目录', () => {
  cleanupDir(TEMP_DIR)
})

test('slice() 默认块写入成功', async t => {
  const readable = fsImage.slice()
  const tempFilename = path.join(TEMP_DIR, 'slice_temp.jpg')

  await new Promise((resolve, reject) => {
    const writable = fs.createWriteStream(tempFilename)
    writable.once('finish', resolve)
    writable.once('error', reject)
    readable.once('error', reject)
    readable.pipe(writable)
  })

  t.is(fs.statSync(tempFilename).size, DEFAULT_BLOCK_SIZE)
})

test('sliceAsFile 指定范围写入成功', async t => {
  const tempFilename = path.join(TEMP_DIR, 'sliceAsFile_temp.jpg')
  await fsImage.sliceAsFile(tempFilename, { start: 0, end: 500000 })
  t.is(fs.statSync(tempFilename).size, 500000)
})

test('sliceAsFile 文本内容一致', async t => {
  const tempFilename = path.join(TEMP_DIR, 'sliceAsFile_text_temp')
  await fsText.sliceAsFile(tempFilename, { start: 0, end: 10 })
  const data = fs.readFileSync(tempFilename, 'utf-8')
  t.is(data, "A\nA's\nAA's")
  t.is(fs.statSync(tempFilename).size, 10)
})

test('sliceAsFile 默认区间使用块大小', async t => {
  const tempFilename = path.join(TEMP_DIR, 'sliceAsFile_default_interval_temp.jpg')
  await fsImage.sliceAsFile(tempFilename)
  t.is(fs.statSync(tempFilename).size, DEFAULT_BLOCK_SIZE)
})

test('avgSliceAsFile 平均分片生成文件', async t => {
  const files = await fsImage.avgSliceAsFile()
  t.is(files.length, 3)
  t.is(fs.statSync(files[0]).size, DEFAULT_BLOCK_SIZE)
  t.is(fs.statSync(files[1]).size, DEFAULT_BLOCK_SIZE)
  t.is(fs.statSync(files[2]).size, 107343)
  files.forEach(file => fs.unlinkSync(file))
})

test('avgSliceAsFile index 校验非法参数', async t => {
  const error = await t.throwsAsync(async () => fsImage.avgSliceAsFile({ index: 0 }))
  t.regex(error?.message ?? '', /index must be a positive integer/)
})

test('avgSliceAsFile 支持中途续切', async t => {
  const files = await fsImage.avgSliceAsFile({ index: 2 })
  t.is(files.length, 2)
  t.is(fs.statSync(files[0]).size, DEFAULT_BLOCK_SIZE)
  files.forEach(file => fs.unlinkSync(file))
})

test('join 将分片拼接与原文件一致', async t => {
  const tempFilename = path.join(TEMP_DIR, 'join_temp')
  const res = await fsText.avgSliceAsFile()
  const writable = fs.createWriteStream(tempFilename)
  await fsText.join(res, writable)
  t.is(fs.statSync(TEXT_FILENAME).size, fs.statSync(tempFilename).size)
  const textData = fs.readFileSync(TEXT_FILENAME, 'utf-8')
  const tempData = fs.readFileSync(tempFilename, 'utf-8')
  t.is(textData, tempData)
  fs.unlinkSync(tempFilename)
  res.forEach(file => fs.unlinkSync(file))
})

test('joinAsFile 直接输出文件正确', async t => {
  const tempFilename = path.join(TEMP_DIR, 'joinAsFile_temp')
  const res = await fsText.avgSliceAsFile()
  await fsText.joinAsFile(res, tempFilename)
  t.is(fs.statSync(TEXT_FILENAME).size, fs.statSync(tempFilename).size)
  const textData = fs.readFileSync(TEXT_FILENAME, 'utf-8')
  const tempData = fs.readFileSync(tempFilename, 'utf-8')
  t.is(textData, tempData)
  fs.unlinkSync(tempFilename)
  res.forEach(file => fs.unlinkSync(file))
})

test('sliceAsFile 自动创建缺失目录', async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-slice-string-'))
  const nested = path.join(tempDir, 'nested', 'output.bin')
  await fsImage.sliceAsFile(nested, { start: 0, end: 10 })
  t.true(fs.existsSync(nested))
  fs.unlinkSync(nested)
  fs.rmdirSync(path.join(tempDir, 'nested'))
  fs.rmdirSync(tempDir)
})
