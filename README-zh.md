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
  const slicer = fsSlice('./big-file.bin', { blockSize: 256 * 1024 })
  const chunks = await slicer.avgSliceAsFile()
  console.log('生成分片：', chunks)

  await slicer.joinAsFile(chunks, './output.bin')
  console.log('合并完成')
}

demo().catch(console.error)
```

### CommonJS

```js
const fsSlice = require('fs-slice')

const slicer = fsSlice(Buffer.from('hello world'))
const stream = slicer.slice({ start: 0, end: 5 })
stream.pipe(process.stdout)
```

## ⚙️ 架构与工作流

1. **实例化**：传入文件路径或 Buffer，可通过 `blockSize`、`destPath`、`filename` 定制行为。
2. **切片读取**：使用 `slice` 获取任意范围的可读流；`sliceAsFile` 可将区间直接写入文件。
3. **平均分片**：调用 `avgSliceAsFile` 按块大小批量输出文件，并支持使用 `index` 续切。
4. **分片合并**：`join` 接受分片路径数组与目标写流；`joinAsFile` 提供内建写流封装。

内部利用 `crypto.randomBytes` 生成随机前缀避免命名冲突，并通过 `ensureDirectorySync` 在写入前确保目录存在。

## 🔍 API 速查表

| 方法                                                   | 说明                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `fsSlice(input, opts?)`                              | 工厂函数，返回 `FsSliceInstance`，支持文件路径或 Buffer 输入。 |
| `slice(options?)`                                    | 返回指定范围的 `Readable` 流，默认读取第一块数据。             |
| `sliceAsFile(filepath, readOptions?, writeOptions?)` | 将指定区间写入目标文件，并自动清理流事件。                       |
| `avgSliceAsFile(options?)`                           | 按块大小批量导出文件，`index` 可指定起始块。                   |
| `join(filenameArray, writable)`                      | 按顺序读取分片并写入给定 `Writable`。                          |
| `joinAsFile(filenameArray, filepath)`                | 语法糖，内部创建写流并调用 `join`。                            |
| `formatFilename(index?)`                             | 生成 `<16字节随机数>_<index>_<原文件名>` 的分片名称。          |

### 选项说明

| 参数                            | 类型                      | 默认值                    | 描述                                                               |
| ------------------------------- | ------------------------- | ------------------------- | ------------------------------------------------------------------ |
| `blockSize`                   | `number`                | `204800`                | 单个分片的字节大小，必须为正整数。                                 |
| `destPath`                    | `string`                | `os.tmpdir()`           | `avgSliceAsFile` 输出目录，同时用于随机文件前缀。                |
| `filename`                    | `string`                | `Date.now().toString()` | Buffer 模式下用于生成分片名称的逻辑文件名。                        |
| `slice.start` / `slice.end` | `number`                | `0 / blockSize`         | `slice`/`sliceAsFile` 的读取区间，`end` 为开区间。           |
| `avgSliceAsFile.index`        | `number`                | `1`                     | 指定从第几块开始生成文件，必须为正整数。                           |
| `writeOptions`                | `fs.WriteStreamOptions` | —                        | 透传至 `fs.createWriteStream`，可自定义 `flags`、`mode` 等。 |

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
// 第一次生成所有分片
const files = await slicer.avgSliceAsFile()

// 如果前两块已上传，可传入 index 从第三块开始
const rest = await slicer.avgSliceAsFile({ index: 3 })
```

### 合并分片

```ts
const chunks = await slicer.avgSliceAsFile()
await slicer.joinAsFile(chunks, './merged.bin')
```

## ⚠️ 错误处理

- 参数类型错误会直接抛出 `Error`（如 blockSize 不是正整数、index 不合法）。
- `join` 会在写入前校验分片是否存在，发现缺失时立即抛错并销毁写流，避免产生残缺文件。
- 读写流出现错误会调用 `destroy()` 并移除事件监听，同时让 Promise 进入 reject。

## 🧠 最佳实践

- **调整块大小**：块太小会导致 IO 频繁；可根据网络/磁盘吞吐选择 1–4 MB 的大小用于上传场景。
- **管理临时目录**：`avgSliceAsFile` 会生成随机文件，务必在上传/合并完成后清理，以免占满磁盘。
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
