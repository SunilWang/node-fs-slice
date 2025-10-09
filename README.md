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
  const slicer = fsSlice('./big-file.bin', { blockSize: 256 * 1024, checksum: true })
  const { chunks, cleanup } = await slicer.avgSliceAsFile()
  console.log('Chunks generated:', chunks.map(chunk => chunk.filepath))

  await slicer.joinAsFile(chunks, './output.bin', { verify: true })
  await cleanup()
  console.log('Merge finished')
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

## ⚙️ Workflow Overview

1. **Instantiate:** Provide a file path or Buffer; customise via `blockSize`, `destPath`, naming hooks, and checksum options.
2. **Slice:** Use `slice` for arbitrary `Readable` streams, or `sliceAsFile` to persist a range to disk.
3. **Batch split:** Invoke `avgSliceAsFile` to export chunk descriptors (paths + metadata) with resume, concurrency, and checksum support.
4. **Reassemble:** Feed descriptors to `join` or `joinAsFile`, optionally enabling checksum verification.
5. **Cleanup:** Call the returned `cleanup()` helper or `cleanupChunks` later to remove generated temp files.

Internally, chunk filenames reuse a per-instance random hex prefix from `crypto.randomBytes`, and `ensureDirectorySync` guarantees output directories exist before writing.

## 🔍 API Reference

| Method                                                         | Description                                                                                  |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `fsSlice(input, opts?)`                                      | Factory returning an `FsSliceInstance`. `input` accepts a file path or Buffer.             |
| `slice(options?)`                                            | Returns a `Readable` stream for the given range; defaults to the first block.              |
| `sliceAsFile(filepath, readOptions?, writeOptions?)`         | Writes a range to `filepath`, cleaning up stream listeners on completion.                  |
| `avgSliceAsFile(options?)`                                   | Generates chunk descriptors (filepath, offsets, checksum, metadata) plus a `cleanup()` helper. |
| `join(filenameArray, writable, options?)`                    | Pipes chunk descriptors/paths sequentially into a provided `Writable`, with optional verify. |
| `joinAsFile(filenameArray, filepath, options?)`              | Convenience wrapper that creates a write stream internally and supports checksum verify.     |
| `verifyChunks(chunks, options?)`                             | Validates chunk size and checksum information before processing.                           |
| `cleanupChunks(chunks)`                                      | Removes the provided chunk files, ignoring already-removed entries.                         |
| `formatFilename(index?)`                                     | Produces chunk names like `<prefix>_<index>_<original name>` (override with `filenameFormatter`). |

### Chunk Descriptor

`avgSliceAsFile` returns chunk descriptors with the following shape:

| Field               | Description                                                                   |
| ------------------- | ----------------------------------------------------------------------------- |
| `index`             | 1-based sequence number of the chunk.                                         |
| `filepath`          | Absolute path to the generated chunk file.                                    |
| `start` / `end`     | Byte offsets (inclusive/exclusive) relative to the original input.            |
| `size`              | Bytes written to disk for this chunk.                                         |
| `checksum`          | Digest string when checksum generation is enabled.                            |
| `checksumAlgorithm` | Algorithm used to produce the digest (e.g. `sha256`).                         |
| `checksumEncoding`  | Encoding used for the digest string (e.g. `hex`).                             |
| `isNew`             | Indicates whether the file was freshly written during the current call.       |
| `metadata`          | Optional payload returned from `metadataProvider`.                            |

If you only need filenames, map the descriptors via `chunks.map(chunk => chunk.filepath)`.

### Options

| Option                              | Type                                       | Default                     | Description                                                                                 |
| ----------------------------------- | ------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------- |
| `blockSize`                         | `number`                                   | `204800`                    | Bytes per chunk. Must be a positive integer.                                                |
| `destPath`                          | `string`                                   | `os.tmpdir()`               | Output directory for generated chunks (create-on-demand).                                   |
| `filename`                          | `string`                                   | `Date.now().toString()`     | Logical filename when slicing Buffers (used in chunk names & metadata).                     |
| `filenameFormatter`                 | `(info) => string`                         | per-instance random prefix | Override chunk naming. Receives `{ index, originalName, sourceType }`.                     |
| `metadataProvider`                  | `(info) => Record<string, unknown>`        | `undefined`                 | Attach custom metadata to each chunk. Receives `{ start, end, size, checksum, isNew }`.     |
| `checksum`                          | ``boolean \| ChecksumOptions``             | `false`                     | Enable automatic checksum generation (default `sha256` + hex).                              |
| `resumeStrategy`                    | ``'overwrite' \| 'skipExisting'``          | `'overwrite'`               | Reuse existing chunks when sizes match.                                                     |
| `concurrency`                       | `number`                                   | `1`                         | Maximum concurrent chunk writes for `avgSliceAsFile`.                                       |
| `slice.start` / `slice.end`         | `number`                                   | `0 / blockSize`             | Range boundaries for `slice`/`sliceAsFile`; `end` is exclusive.                             |
| `avgSliceAsFile.index`              | `number`                                   | `1`                         | Starting chunk index when resuming; must be a positive integer.                             |
| `avgSliceAsFile.resumeStrategy`     | ``'overwrite' \| 'skipExisting'``          | instance default            | Override resume behaviour per call.                                                         |
| `avgSliceAsFile.concurrency`        | `number`                                   | instance default            | Override concurrency per call.                                                              |
| `avgSliceAsFile.checksum`           | ``boolean \| ChecksumOptions``             | instance default            | Enable or customise checksum generation per call.                                           |
| `writeOptions`                | `fs.WriteStreamOptions` | —                        | Forwarded to `fs.createWriteStream` for advanced control.                 |

## 🛠 Advanced Controls

- **Custom naming & metadata:** Supply `filenameFormatter` to stabilise chunk file names and `metadataProvider` to attach domain-specific payloads (e.g. upload IDs, byte ranges).
- **Checksum & verification:** Enable `checksum` globally or per call to embed digests in descriptors, then run `verifyChunks()` or `join(..., { verify: true })` to guard merges.
- **Concurrency & resume:** Tune `concurrency` for faster splitting and set `resumeStrategy: 'skipExisting'` to reuse already generated chunks whose size matches.
- **Cleanup helpers:** Every `avgSliceAsFile` call returns `{ cleanup }`; invoke it or `cleanupChunks(descriptors)` later to remove generated temp files without worrying about missing files.

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
// Generate all chunks (with descriptors)
const { chunks, cleanup } = await slicer.avgSliceAsFile({ checksum: true })
const files = chunks.map(chunk => chunk.filepath)

// Resume from the third chunk while reusing existing files
const resumed = await slicer.avgSliceAsFile({ index: 3, resumeStrategy: 'skipExisting' })
```

### Merge chunks

```ts
const { chunks, cleanup } = await slicer.avgSliceAsFile({ checksum: true })
await slicer.joinAsFile(chunks, './merged.bin', { verify: true })
await cleanup()
```

## ⚠️ Error Handling

- Invalid parameters (e.g., non-integer `blockSize` or `index`) throw synchronously.
- `join` validates chunk descriptors before piping and destroys the write stream on failure to avoid partial files.
- `verifyChunks`/`join(..., { verify: true })` re-compute checksums and raise on mismatches.
- Stream errors trigger `destroy()` on both ends and reject the surrounding Promise.

## 🧠 Best Practices

- **Tune `blockSize`:** Extremely small blocks amplify IO overhead. Consider 1–4 MB chunks for upload scenarios.
- **Manage temp files:** Call the returned `cleanup()` helper or `cleanupChunks` to remove generated chunks.
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
