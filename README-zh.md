# node-fs-slice 中文版

[![npm version](https://img.shields.io/npm/v/fs-slice.svg)](https://www.npmjs.com/package/fs-slice)
[![npm downloads](https://img.shields.io/npm/dt/fs-slice.svg)](https://www.npmjs.com/package/fs-slice)
[![TypeScript](https://img.shields.io/badge/typescript-supported-blue.svg)](https://www.typescriptlang.org/)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

🚀 **node-fs-slice** 是一个面向流式处理的文件切片与合并工具库，提供 TypeScript 类型支持、零拷贝 Buffer 复用、目录自动创建与严格的异常处理，适用于大文件秒传、断点续传、分片上传等场景。

> English version is available in [README.md](README.md).

## ✨ 特性亮点

- **🔪 精准切片**：`slice` 支持按任意字节区间返回可读流，无需一次性加载整文件。
- **💾 内存友好**：Buffer 输入会被零拷贝缓存，避免大文件双倍占用内存。
- **📁 目录兜底**：`sliceAsFile`、`avgSliceAsFile`、`joinAsFile` 自动创建目标目录，减少环境差异导致的 ENOENT 异常。
- **🧩 顺序合并**：`join` 串行写入每个分片，发生错误时会立即销毁写流并回滚。
- **📐 平均分块**：`avgSliceAsFile` 按块大小批量生成文件，可借助 `index` 参数实现断点续切。
- **✅ 类型安全**：内置 TypeScript 声明，提供严格的参数约束与返回类型。

## 📦 安装

```bash
npm install fs-slice
```

### 环境要求

- Node.js **18.0.0** 或更高版本

## 🚀 快速上手

### TypeScript / ES Module

```ts
import fsSlice from 'fs-slice'

async function demo () {
  const slicer = fsSlice('./big-file.bin', { blockSize: 256 * 1024, checksum: true })
  const { chunks, cleanup } = await slicer.avgSliceAsFile()
  console.log('生成分片：', chunks.map(chunk => chunk.filepath))

  await slicer.joinAsFile(chunks, './output.bin', { verify: true })
  await cleanup()
  console.log('合并完成')
}

demo().catch(console.error)
```

### CommonJS

```js
const fsSlice = require('fs-slice')

const slicer = fsSlice(Buffer.from('hello world'), { checksum: true })
const stream = slicer.slice({ start: 0, end: 5 })
stream.pipe(process.stdout)
```

## ⚙️ 架构与工作流

1. **实例化**：传入文件路径或 Buffer，可同时配置 `blockSize`、`destPath`、命名回调与校验选项。
2. **切片读取**：使用 `slice` 获取任意范围的可读流；`sliceAsFile` 可将区间直接写入文件。
3. **平均分片**：调用 `avgSliceAsFile` 获得包含路径、元数据、校验值的分片描述，并支持并发与续传策略。
4. **分片合并**：向 `join`/`joinAsFile` 传入分片描述，配合 `verify: true` 自动校验摘要。
5. **清理临时文件**：执行返回的 `cleanup()` 或后续调用 `cleanupChunks`，安全删除生成的切片。

内部利用 `crypto.randomBytes` 为每个实例生成固定随机前缀避免命名冲突，并通过 `ensureDirectorySync` 在写入前确保目录存在。

## 🔍 API 速查表

| 方法                                                         | 说明                                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------------------- |
| `fsSlice(input, opts?)`                                      | 工厂函数，返回 `FsSliceInstance`，支持文件路径或 Buffer 输入。     |
| `slice(options?)`                                            | 返回指定范围的 `Readable` 流，默认读取第一块数据。                 |
| `sliceAsFile(filepath, readOptions?, writeOptions?)`         | 将指定区间写入目标文件，并自动清理流事件。                           |
| `avgSliceAsFile(options?)`                                   | 按块大小批量生成分片描述（含路径、偏移、校验、元数据）及 `cleanup()`。 |
| `join(filenameArray, writable, options?)`                    | 按顺序写入分片描述/路径，可通过 `verify: true` 自动校验摘要。        |
| `joinAsFile(filenameArray, filepath, options?)`              | 语法糖：内部创建写流并支持校验选项。                                 |
| `verifyChunks(chunks, options?)`                             | 在合并前校验分片的尺寸与校验值。                                     |
| `cleanupChunks(chunks)`                                      | 批量删除分片文件，忽略已不存在的条目。                               |
| `formatFilename(index?)`                                     | 生成 `<前缀>_<index>_<原文件名>` 的分片名称，可通过回调覆写。        |

### 分片描述结构

`avgSliceAsFile` 返回的 `chunks` 为分片描述对象，字段含义如下：

| 字段                 | 说明                                                         |
| -------------------- | ------------------------------------------------------------ |
| `index`              | 分片的 1 基序号。                                            |
| `filepath`           | 该分片对应的绝对文件路径。                                   |
| `start` / `end`      | 相对于原始输入的字节起止位置（闭开区间）。                   |
| `size`               | 实际写入磁盘的字节数。                                       |
| `checksum`           | 启用校验后生成的摘要字符串。                                 |
| `checksumAlgorithm`  | 生成摘要时使用的算法，如 `sha256`。                          |
| `checksumEncoding`   | 摘要的编码方式，如 `hex`。                                   |
| `isNew`              | 标记该分片是否在本次调用中新写入。                           |
| `metadata`           | `metadataProvider` 返回的自定义数据。                         |

若只需要文件路径，可执行 `chunks.map(chunk => chunk.filepath)`。

### 选项说明

| 参数                            | 类型                      | 默认值                    | 描述                                                               |
| ------------------------------- | ------------------------- | ------------------------- | ------------------------------------------------------------------ |
| 参数                               | 类型                                       | 默认值                      | 描述                                                                                 |
| ---------------------------------- | ------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------ |
| `blockSize`                        | `number`                                   | `204800`                    | 单个分片的字节大小，必须为正整数。                                                   |
| `destPath`                         | `string`                                   | `os.tmpdir()`               | `avgSliceAsFile` 输出目录，必要时自动创建。                                         |
| `filename`                         | `string`                                   | `Date.now().toString()`     | Buffer 模式生成分片名称时使用的逻辑文件名。                                           |
| `filenameFormatter`                | `(info) => string`                         | 每个实例固定随机前缀        | 自定义分片文件命名，入参包含 `{ index, originalName, sourceType }`。               |
| `metadataProvider`                 | `(info) => Record<string, unknown>`        | `undefined`                 | 为每个分片附加元数据，例如 `{ range: [start, end] }`。                               |
| `checksum`                         | ``boolean \| ChecksumOptions``             | `false`                     | 启用分片校验值生成，默认算法为 `sha256` + hex。                                      |
| `resumeStrategy`                   | ``'overwrite' \| 'skipExisting'``          | `'overwrite'`               | 是否跳过尺寸匹配的已存在分片。                                                       |
| `concurrency`                      | `number`                                   | `1`                         | `avgSliceAsFile` 的最大并发写入任务数。                                              |
| `slice.start` / `slice.end`        | `number`                                   | `0 / blockSize`             | `slice`/`sliceAsFile` 的读取区间，`end` 为开区间。                                    |
| `avgSliceAsFile.index`             | `number`                                   | `1`                         | 指定从第几块开始生成分片，必须为正整数。                                             |
| `avgSliceAsFile.resumeStrategy`    | ``'overwrite' \| 'skipExisting'``          | 实例默认值                  | 针对单次调用覆写续传策略。                                                           |
| `avgSliceAsFile.concurrency`       | `number`                                   | 实例默认值                  | 针对单次调用覆写并发数量。                                                           |
| `avgSliceAsFile.checksum`          | ``boolean \| ChecksumOptions``             | 实例默认值                  | 针对单次调用覆写校验算法与编码。                                                     |
| `writeOptions`                     | `fs.WriteStreamOptions`                    | —                           | 透传至 `fs.createWriteStream`，可自定义 `flags`、`mode` 等。                         |

## 🛠 高级控制

- **命名与元数据**：通过 `filenameFormatter` 固定分片命名，通过 `metadataProvider` 附加业务字段（如上传批次、字节范围）。
- **校验与验证**：开启 `checksum` 后分片会携带摘要，可在 `verifyChunks()` 或 `join(..., { verify: true })` 阶段自动校验。
- **并发与续传**：调节 `concurrency` 提升分片速度，结合 `resumeStrategy: 'skipExisting'` 重用已存在且尺寸匹配的文件。
- **清理工具**：`avgSliceAsFile` 返回的 `cleanup()` 以及实例方法 `cleanupChunks` 会在忽略缺失文件的前提下安全删除分片。

```ts
const slicer = fsSlice('./movie.mp4', {
  blockSize: 1024 * 1024,
  checksum: { algorithm: 'sha1' },
  filenameFormatter: ({ index, originalName }) => `${originalName}.part.${index}`,
  metadataProvider: info => ({ range: [info.start, info.end] })
})

const { chunks, cleanup } = await slicer.avgSliceAsFile({ concurrency: 4, resumeStrategy: 'skipExisting' })
await slicer.joinAsFile(chunks, './movie-restored.mp4', { verify: true })
await cleanup()
```

## 📚 使用示例

### 读取任意区间

```ts
const slicer = fsSlice('./test/data/text')
const readable = slicer.slice({ start: 10, end: 30 })
readable.on('data', chunk => {
  console.log('片段内容：', chunk.toString())
})
```

### 将分片保存到磁盘

```ts
await slicer.sliceAsFile('./temp/part-1.bin', { start: 0, end: 1024 })
```

### 平均分片并续切

```ts
// 第一次生成所有分片（包含描述信息）
const { chunks, cleanup } = await slicer.avgSliceAsFile({ checksum: true })
const files = chunks.map(chunk => chunk.filepath)

// 如果前两块已上传，可传入 index 从第三块开始，并重用已有文件
const rest = await slicer.avgSliceAsFile({ index: 3, resumeStrategy: 'skipExisting' })
```

### 合并分片

```ts
const { chunks, cleanup } = await slicer.avgSliceAsFile({ checksum: true })
await slicer.joinAsFile(chunks, './merged.bin', { verify: true })
await cleanup()
```

## ⚠️ 错误处理

- 参数类型错误会直接抛出 `Error`（如 blockSize 不是正整数、index 不合法）。
- `join` 会在写入前校验分片是否存在，发现缺失时立即抛错并销毁写流，避免产生残缺文件。
- `verifyChunks` / `join(..., { verify: true })` 会重新计算摘要，发现不一致立即报错。
- 读写流出现错误会调用 `destroy()` 并移除事件监听，同时让 Promise 进入 reject。

## 🧠 最佳实践

- **调整块大小**：块太小会导致 IO 频繁；可根据网络/磁盘吞吐选择 1–4 MB 的大小用于上传场景。
- **管理临时目录**：调用返回的 `cleanup()` 或 `cleanupChunks`，安全清理生成的分片文件。
- **保持顺序元数据**：`join` 依赖 `filenameArray` 的顺序，务必保存好原始顺序或附带索引。
- **避免重复复制**：Buffer 模式已零拷贝复用，无需再次 `Buffer.from()`。

## 🧪 脚本与测试

```bash
npm run clean      # 清理 dist/
npm run build      # TypeScript 编译
npm test           # clean + tsc + AVA 执行全部 .mjs 测试
```

测试套件使用 AVA，覆盖字符串与 Buffer 场景，并包含索引校验、目录创建、异常路径等分支。

## 🤝 贡献指南

1. Fork & 拉取代码，并确认环境满足 Node.js 18+
2. 执行 `npm install` 安装依赖
3. 按现有代码风格编写（TypeScript 严格模式、两空格缩进、单引号）
4. 提交前跑通 `npm run build` 与 `npm test`
5. 新增/变更功能请同步更新文档或示例

欢迎通过 Issue / PR 反馈需求或问题。

## 📄 许可证

MIT © Sunil Wang
