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
const TEMP_DIR = path.join(__dirname, 'temp', 'buffer')

const DEFAULT_BLOCK_SIZE = 204800

let fsImage
let fsText

function cleanupDir (dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir)) {
    const entryPath = path.join(dir, entry)
    const stat = fs.statSync(entryPath)
    if (stat.isDirectory()) {
      cleanupDir(entryPath)
      fs.rmdirSync(entryPath)
    } else {
      fs.unlinkSync(entryPath)
    }
  }
}

function ensureDir (dir) {
  fs.mkdirSync(dir, { recursive: true })
}

test.before('初始化 Buffer 输入实例', t => {
  const imageBuffer = fs.readFileSync(IMAGE_FILENAME)
  const textBuffer = fs.readFileSync(TEXT_FILENAME)
  fsImage = fss(imageBuffer, { blockSize: DEFAULT_BLOCK_SIZE })
  fsText = fss(textBuffer, { blockSize: DEFAULT_BLOCK_SIZE })
  ensureDir(TEMP_DIR)
  t.pass()
})

test.after.always('清理临时目录', () => {
  cleanupDir(TEMP_DIR)
})

test.serial('slice() 默认块写入成功(Buffer)', async t => {
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

test.serial('sliceAsFile 指定范围写入成功(Buffer)', async t => {
  const tempFilename = path.join(TEMP_DIR, 'sliceAsFile_temp.jpg')
  await fsImage.sliceAsFile(tempFilename, { start: 0, end: 500000 })
  t.is(fs.statSync(tempFilename).size, 500000)
})

test.serial('sliceAsFile 文本内容一致(Buffer)', async t => {
  const tempFilename = path.join(TEMP_DIR, 'sliceAsFile_text_temp')
  await fsText.sliceAsFile(tempFilename, { start: 0, end: 10 })
  const data = fs.readFileSync(tempFilename, 'utf-8')
  t.is(data, "A\nA's\nAA's")
  t.is(fs.statSync(tempFilename).size, 10)
})

test.serial('avgSliceAsFile 生成文件(Buffer)', async t => {
  const { chunks, cleanup } = await fsImage.avgSliceAsFile()
  t.is(chunks.length, 3)
  t.true(chunks.every(chunk => typeof chunk.checksum === 'undefined'))
  t.is(fs.statSync(chunks[0].filepath).size, DEFAULT_BLOCK_SIZE)
  t.is(fs.statSync(chunks[1].filepath).size, DEFAULT_BLOCK_SIZE)
  t.is(fs.statSync(chunks[2].filepath).size, 107343)
  await cleanup()
})

test.serial('avgSliceAsFile 自定义目录自动创建(Buffer)', async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-slice-buffer-'))
  const customDest = path.join(tempDir, 'nested', 'chunks')
  const instance = fss(fs.readFileSync(TEXT_FILENAME), {
    blockSize: 16,
    destPath: customDest
  })
  const { chunks, cleanup } = await instance.avgSliceAsFile({ checksum: true })
  t.true(fs.existsSync(customDest))
  t.true(chunks.every(chunk => chunk.filepath.startsWith(customDest)))
  t.true(chunks.every(chunk => typeof chunk.checksum === 'string'))
  await cleanup()
  fs.rmdirSync(customDest)
  fs.rmdirSync(path.join(tempDir, 'nested'))
  fs.rmdirSync(tempDir)
})

test.serial('join 将分片拼接与原文件一致(Buffer)', async t => {
  const tempFilename = path.join(TEMP_DIR, 'join_temp')
  const { chunks, cleanup } = await fsText.avgSliceAsFile({ checksum: true })
  const writable = fs.createWriteStream(tempFilename)
  await fsText.join(chunks, writable, { verify: true })
  const textData = fs.readFileSync(TEXT_FILENAME, 'utf-8')
  const tempData = fs.readFileSync(tempFilename, 'utf-8')
  t.is(textData, tempData)
  fs.unlinkSync(tempFilename)
  await cleanup()
})

test.serial('joinAsFile 直接输出文件正确(Buffer)', async t => {
  const tempFilename = path.join(TEMP_DIR, 'joinAsFile_temp')
  const { chunks, cleanup } = await fsText.avgSliceAsFile({ checksum: true })
  await fsText.joinAsFile(chunks, tempFilename, { verify: true })
  const textData = fs.readFileSync(TEXT_FILENAME, 'utf-8')
  const tempData = fs.readFileSync(tempFilename, 'utf-8')
  t.is(textData, tempData)
  fs.unlinkSync(tempFilename)
  await cleanup()
})

test.serial('join 遇到不存在的分片抛错(Buffer)', async t => {
  const tempFilename = path.join(TEMP_DIR, 'join_error')
  const writable = fs.createWriteStream(tempFilename)
  const error = await t.throwsAsync(async () => fsText.join(['./not-exist'], writable))
  t.regex(error?.message ?? '', /file does not exist/)
  writable.destroy()
})
