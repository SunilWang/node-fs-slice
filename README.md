# node-fs-slice

[![npm version](https://img.shields.io/npm/v/fs-slice.svg)](https://www.npmjs.com/package/fs-slice)
[![npm downloads](https://img.shields.io/npm/dt/fs-slice.svg)](https://www.npmjs.com/package/fs-slice)
[![TypeScript](https://img.shields.io/badge/typescript-supported-blue.svg)](https://www.typescriptlang.org/)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

🚀 **node-fs-slice** is a streaming-oriented file slicing and merging toolkit for Node.js. It ships with TypeScript definitions, zero-copy Buffer support, automatic directory provisioning, and defensive error handling—perfect for resumable uploads, chunked transfers, and large-file processing pipelines.

> Looking for the Chinese documentation? See [README-zh.md](README-zh.md).

## ✨ Highlights

- **🔪 Precise slicing:** `slice` exposes any byte range as a `Readable` stream without loading entire files in memory.
- **💾 Memory friendly:** Buffer inputs are cached without cloning, avoiding duplicate allocations for large payloads.
- **📁 Directory safety:** `sliceAsFile`, `avgSliceAsFile`, and `joinAsFile` create destination directories automatically to prevent `ENOENT` failures.
- **🧩 Ordered merging:** `join` pipes each chunk sequentially and tears down write streams safely on error.
- **📐 Even chunking:** `avgSliceAsFile` batches chunk files by block size and can resume from a specific index.
- **✅ Type safe:** First-class TypeScript types guard parameters and return values.

## 📦 Installation

```bash
npm install fs-slice
```

### Requirements

- Node.js **18.0.0** or higher

## 🚀 Quick Start

### TypeScript / ES Module

```ts
import fsSlice from 'fs-slice'

async function demo () {
  const slicer = fsSlice('./big-file.bin', { blockSize: 256 * 1024 })
  const chunks = await slicer.avgSliceAsFile()
  console.log('Chunks generated:', chunks)

  await slicer.joinAsFile(chunks, './output.bin')
  console.log('Merge finished')
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

## ⚙️ Workflow Overview

1. **Instantiate:** Provide a file path or Buffer; customise via `blockSize`, `destPath`, and `filename`.
2. **Slice:** Use `slice` for arbitrary `Readable` streams, or `sliceAsFile` to persist a range to disk.
3. **Batch split:** Invoke `avgSliceAsFile` to export evenly sized chunks, with optional `index` resume support.
4. **Reassemble:** Supply chunk paths to `join` (with a writable stream) or let `joinAsFile` create one automatically.

Internally, chunk filenames use a random hex prefix from `crypto.randomBytes`, and `ensureDirectorySync` guarantees output directories exist before writing.

## 🔍 API Reference

| Method                                                 | Description                                                                        |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `fsSlice(input, opts?)`                              | Factory returning an `FsSliceInstance`. `input` accepts a file path or Buffer. |
| `slice(options?)`                                    | Returns a `Readable` stream for the given range; defaults to the first block.    |
| `sliceAsFile(filepath, readOptions?, writeOptions?)` | Writes a range to `filepath`, cleaning up stream listeners on completion.        |
| `avgSliceAsFile(options?)`                           | Generates chunk files based on block size; supports `index` to resume.           |
| `join(filenameArray, writable)`                      | Pipes chunk files sequentially into a provided `Writable`.                       |
| `joinAsFile(filenameArray, filepath)`                | Convenience wrapper that creates a write stream internally.                        |
| `formatFilename(index?)`                             | Produces chunk names like `<16-byte hex>_<index>_<original name>`.               |

### Options

| Option                          | Type                      | Default                   | Description                                                                 |
| ------------------------------- | ------------------------- | ------------------------- | --------------------------------------------------------------------------- |
| `blockSize`                   | `number`                | `204800`                | Bytes per chunk. Must be a positive integer.                                |
| `destPath`                    | `string`                | `os.tmpdir()`           | Output directory for `avgSliceAsFile`; also used for generated filenames. |
| `filename`                    | `string`                | `Date.now().toString()` | Logical filename when slicing Buffers (used in chunk names).                |
| `slice.start` / `slice.end` | `number`                | `0 / blockSize`         | Range boundaries for `slice`/`sliceAsFile`; `end` is exclusive.       |
| `avgSliceAsFile.index`        | `number`                | `1`                     | Starting chunk index when resuming; must be a positive integer.             |
| `writeOptions`                | `fs.WriteStreamOptions` | —                        | Forwarded to `fs.createWriteStream` for advanced control.                 |

## 📚 Usage Examples

### Read an arbitrary range

```ts
const slicer = fsSlice('./test/data/text')
const readable = slicer.slice({ start: 10, end: 30 })
readable.on('data', chunk => {
  console.log('Fragment:', chunk.toString())
})
```

### Persist a slice to disk

```ts
await slicer.sliceAsFile('./temp/part-1.bin', { start: 0, end: 1024 })
```

### Even chunking with resume

```ts
// Generate all chunks
const files = await slicer.avgSliceAsFile()

// Resume from the third chunk
const rest = await slicer.avgSliceAsFile({ index: 3 })
```

### Merge chunks

```ts
const chunks = await slicer.avgSliceAsFile()
await slicer.joinAsFile(chunks, './merged.bin')
```

## ⚠️ Error Handling

- Invalid parameters (e.g., non-integer `blockSize` or `index`) throw synchronously.
- `join` validates chunk paths before piping and destroys the write stream on failure to avoid partial files.
- Stream errors trigger `destroy()` on both ends and reject the surrounding Promise.

## 🧠 Best Practices

- **Tune `blockSize`:** Extremely small blocks amplify IO overhead. Consider 1–4 MB chunks for upload scenarios.
- **Manage temp files:** `avgSliceAsFile` creates random files—clean them up after use.
- **Preserve order metadata:** `join` depends on the order of `filenameArray`; persist the original sequence.
- **Avoid extra copies:** Buffer mode already uses zero-copy caching; no need for additional `Buffer.from()` calls.

## 🧪 Scripts & Testing

```bash
npm run clean      # remove dist/
npm run build      # run TypeScript compiler
npm test           # clean + tsc + AVA over all .mjs tests
```

The AVA suite covers both string and Buffer workflows, including index validation, directory creation, and error paths.

## 🤝 Contributing

1. Fork the repo and ensure Node.js 18+ is installed.
2. Run `npm install` to grab dependencies.
3. Follow the existing TypeScript conventions (two-space indentation, single quotes, strict mode).
4. Before submitting, execute `npm run build` and `npm test`.
5. Update documentation or examples when adding new features.

Issues and pull requests are warmly welcomed.

## 📄 License

MIT © Sunil Wang
