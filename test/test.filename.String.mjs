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

test.before('初始化文件实例', t => {
  fsImage = fss(IMAGE_FILENAME, { blockSize: DEFAULT_BLOCK_SIZE })
  fsText = fss(TEXT_FILENAME, { blockSize: DEFAULT_BLOCK_SIZE })
  ensureDir(TEMP_DIR)
  t.pass()
})

test.after.always('清理临时目录', () => {
  cleanupDir(TEMP_DIR)
})

test.serial('slice() 默认块写入成功', async t => {
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

test.serial('sliceAsFile 指定范围写入成功', async t => {
  const tempFilename = path.join(TEMP_DIR, 'sliceAsFile_temp.jpg')
  await fsImage.sliceAsFile(tempFilename, { start: 0, end: 500000 })
  t.is(fs.statSync(tempFilename).size, 500000)
})

test.serial('sliceAsFile 文本内容一致', async t => {
  const tempFilename = path.join(TEMP_DIR, 'sliceAsFile_text_temp')
  await fsText.sliceAsFile(tempFilename, { start: 0, end: 10 })
  const data = fs.readFileSync(tempFilename, 'utf-8')
  t.is(data, "A\nA's\nAA's")
  t.is(fs.statSync(tempFilename).size, 10)
})

test.serial('sliceAsFile 默认区间使用块大小', async t => {
  const tempFilename = path.join(TEMP_DIR, 'sliceAsFile_default_interval_temp.jpg')
  await fsImage.sliceAsFile(tempFilename)
  t.is(fs.statSync(tempFilename).size, DEFAULT_BLOCK_SIZE)
})

test.serial('avgSliceAsFile 平均分片生成文件', async t => {
  const { chunks, cleanup } = await fsImage.avgSliceAsFile()
  t.is(chunks.length, 3)
  t.deepEqual(
    chunks.map(chunk => chunk.index),
    [1, 2, 3]
  )
  t.is(fs.statSync(chunks[0].filepath).size, DEFAULT_BLOCK_SIZE)
  t.is(fs.statSync(chunks[1].filepath).size, DEFAULT_BLOCK_SIZE)
  t.is(fs.statSync(chunks[2].filepath).size, 107343)
  await cleanup()
})

test.serial('avgSliceAsFile index 校验非法参数', async t => {
  const error = await t.throwsAsync(async () => fsImage.avgSliceAsFile({ index: 0 }))
  t.regex(error?.message ?? '', /index must be a positive integer/)
})

test.serial('avgSliceAsFile 支持中途续切', async t => {
  const { chunks, cleanup } = await fsImage.avgSliceAsFile({ index: 2 })
  t.is(chunks.length, 2)
  t.deepEqual(
    chunks.map(chunk => chunk.index),
    [2, 3]
  )
  t.is(chunks[0].size, fs.statSync(chunks[0].filepath).size)
  await cleanup()
})

test.serial('avgSliceAsFile resumeStrategy skipExisting', async t => {
  const firstRun = await fsImage.avgSliceAsFile({ checksum: true })
  const [preserved, ...rest] = firstRun.chunks
  await fsImage.cleanupChunks(rest)

  const resumed = await fsImage.avgSliceAsFile({
    index: 1,
    resumeStrategy: 'skipExisting',
    checksum: true,
    concurrency: 2
  })

  t.false(resumed.chunks[0].isNew)
  t.true(resumed.chunks.slice(1).every(chunk => chunk.isNew))
  t.truthy(resumed.chunks[0].checksum)

  await resumed.cleanup()
  await fsImage.cleanupChunks([preserved])
  await firstRun.cleanup()
})

test.serial('avgSliceAsFile 自定义文件名与元数据', async t => {
  const customDir = path.join(TEMP_DIR, 'custom-meta')
  const custom = fss(IMAGE_FILENAME, {
    blockSize: DEFAULT_BLOCK_SIZE,
    destPath: customDir,
    filenameFormatter: info => `${info.originalName}-chunk-${info.index}`,
    metadataProvider: info => ({
      range: [info.start, info.end]
    }),
    checksum: { algorithm: 'md5' }
  })

  const { chunks, cleanup } = await custom.avgSliceAsFile()
  t.true(chunks.every(chunk => chunk.filepath.includes('image.jpg-chunk-')))
  t.deepEqual(chunks[0].metadata, { range: [0, DEFAULT_BLOCK_SIZE] })
  t.is(chunks[0].checksumAlgorithm, 'md5')
  t.is(chunks[0].checksumEncoding, 'hex')

  await cleanup()
})

test.serial('verifyChunks 捕获校验失败', async t => {
  const { chunks, cleanup } = await fsText.avgSliceAsFile({ checksum: true })
  const target = chunks[0]
  const original = fs.readFileSync(target.filepath)
  fs.writeFileSync(target.filepath, Buffer.from('corrupt'))

  const error = await t.throwsAsync(async () => fsText.verifyChunks(chunks, { checksum: true }))
  t.regex(error?.message ?? '', /(checksum mismatch|size mismatch)/)

  fs.writeFileSync(target.filepath, original)
  await cleanup()
})

test.serial('cleanupChunks 忽略缺失文件', async t => {
  const { chunks } = await fsText.avgSliceAsFile()
  const missing = chunks[0].filepath
  fs.unlinkSync(missing)

  await t.notThrowsAsync(async () => fsText.cleanupChunks(chunks))
  t.true(chunks.slice(1).every(chunk => !fs.existsSync(chunk.filepath)))
})

test.serial('join 将分片拼接与原文件一致，并开启校验', async t => {
  const tempFilename = path.join(TEMP_DIR, 'join_temp')
  const { chunks, cleanup } = await fsText.avgSliceAsFile({ checksum: true })
  const writable = fs.createWriteStream(tempFilename)
  await fsText.join(chunks, writable, { verify: true })
  t.is(fs.statSync(TEXT_FILENAME).size, fs.statSync(tempFilename).size)
  const textData = fs.readFileSync(TEXT_FILENAME, 'utf-8')
  const tempData = fs.readFileSync(tempFilename, 'utf-8')
  t.is(textData, tempData)
  fs.unlinkSync(tempFilename)
  await cleanup()
})

test.serial('joinAsFile 直接输出文件正确', async t => {
  const tempFilename = path.join(TEMP_DIR, 'joinAsFile_temp')
  const { chunks, cleanup } = await fsText.avgSliceAsFile({ checksum: true })
  await fsText.joinAsFile(chunks, tempFilename, { verify: true })
  t.is(fs.statSync(TEXT_FILENAME).size, fs.statSync(tempFilename).size)
  const textData = fs.readFileSync(TEXT_FILENAME, 'utf-8')
  const tempData = fs.readFileSync(tempFilename, 'utf-8')
  t.is(textData, tempData)
  fs.unlinkSync(tempFilename)
  await cleanup()
})

test.serial('sliceAsFile 自动创建缺失目录', async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-slice-string-'))
  const nested = path.join(tempDir, 'nested', 'output.bin')
  await fsImage.sliceAsFile(nested, { start: 0, end: 10 })
  t.true(fs.existsSync(nested))
  fs.unlinkSync(nested)
  fs.rmdirSync(path.join(tempDir, 'nested'))
  fs.rmdirSync(tempDir)
})
