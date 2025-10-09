"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FsSlice = void 0;
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const stream_1 = require("stream");
/**
 * 默认块大小（字节）。约等于 200 KB，可在创建实例时通过 `blockSize` 自定义覆盖。
 */
const DEFAULT_BLOCK_SIZE = 204800;
/**
 * 默认使用的摘要算法，用于在切片阶段生成校验值。
 */
const DEFAULT_CHECKSUM_ALGORITHM = 'sha256';
/**
 * 默认摘要编码格式。
 */
const DEFAULT_CHECKSUM_ENCODING = 'hex';
/**
 * 默认的续传策略：发现已有分片时直接覆盖。
 */
const DEFAULT_RESUME_STRATEGY = 'overwrite';
/**
 * 默认并发数量。值为 1 时表示串行执行。
 */
const DEFAULT_CONCURRENCY = 1;
/**
 * 判断本地文件是否存在并且是普通文件。
 * 捕获异常以避免因文件不存在导致外部调用抛错。
 */
function fsExistsSync(filePath) {
    try {
        return fs_1.default.statSync(filePath).isFile();
    }
    catch (error) {
        return false;
    }
}
/**
 * 确保目标目录存在。
 * 由于切片操作可能输出到自定义路径，提前创建目录可避免流写入时抛出 ENOENT。
 */
function ensureDirectorySync(dirPath) {
    if (!dirPath)
        return;
    fs_1.default.mkdirSync(dirPath, { recursive: true });
}
/**
 * 统一解析布尔值/对象形式的摘要配置，便于后续调用统一使用。
 */
function resolveChecksumOptions(value) {
    if (!value) {
        return null;
    }
    if (typeof value === 'boolean') {
        return {
            algorithm: DEFAULT_CHECKSUM_ALGORITHM,
            encoding: DEFAULT_CHECKSUM_ENCODING
        };
    }
    const algorithm = value.algorithm ?? DEFAULT_CHECKSUM_ALGORITHM;
    const encoding = value.encoding ?? DEFAULT_CHECKSUM_ENCODING;
    return { algorithm, encoding };
}
/**
 * 类型守卫：判断传入项是否为分片描述对象。
 */
function isChunkDescriptor(value) {
    return typeof value === 'object' && value !== null && 'filepath' in value;
}
/**
 * 安全删除文件。若目标不存在则忽略，避免打断清理流程。
 */
async function removeFileSafe(filePath) {
    await fs_1.default.promises.unlink(filePath).catch(error => {
        if (error?.code === 'ENOENT')
            return;
        throw error;
    });
}
/**
 * 简易的受控并发调度器，确保最多同时运行 `limit` 个任务。
 * 全部任务完成后按照提交顺序返回结果。
 */
async function runWithConcurrencyLimit(tasks, limit) {
    if (tasks.length === 0)
        return [];
    const results = new Array(tasks.length);
    let currentIndex = 0;
    let activeCount = 0;
    return new Promise((resolve, reject) => {
        const launchNext = () => {
            if (currentIndex >= tasks.length) {
                if (activeCount === 0) {
                    resolve(results);
                }
                return;
            }
            while (activeCount < limit && currentIndex < tasks.length) {
                const taskIndex = currentIndex;
                const task = tasks[taskIndex];
                currentIndex += 1;
                activeCount += 1;
                task().then(result => {
                    results[taskIndex] = result;
                    activeCount -= 1;
                    launchNext();
                }).catch(reject);
            }
        };
        launchNext();
    });
}
/**
 * 文件切片工具的核心实例，封装读取、写入、合并等操作。
 * 支持从文件路径或 Buffer 构造。
 */
class FsSlice {
    /**
     * @param input 可以是文件路径或直接传入的二进制 Buffer。
     * @param opts 允许指定切片尺寸、临时目录与默认文件名。
     */
    constructor(input, opts = {}) {
        if (!input) {
            throw new Error('require filename');
        }
        if (typeof input !== 'string' && !Buffer.isBuffer(input)) {
            throw new Error('filename must be a string or Buffer');
        }
        const resolvedBlockSize = opts.blockSize ?? DEFAULT_BLOCK_SIZE;
        // blockSize 直接影响单次读写的数据量，必须是正整数，确保后续块计算稳定
        if (!Number.isFinite(resolvedBlockSize) || resolvedBlockSize <= 0 || !Number.isInteger(resolvedBlockSize)) {
            throw new Error('blockSize must be a positive integer');
        }
        const resolvedDestPath = opts.destPath ?? os_1.default.tmpdir();
        const resolvedFilename = opts.filename ?? `${Date.now()}`;
        const resumeStrategy = opts.resumeStrategy ?? DEFAULT_RESUME_STRATEGY;
        if (resumeStrategy !== 'overwrite' && resumeStrategy !== 'skipExisting') {
            throw new Error("resumeStrategy must be 'overwrite' or 'skipExisting'");
        }
        const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
        if (!Number.isInteger(concurrency) || concurrency <= 0) {
            throw new Error('concurrency must be a positive integer');
        }
        if (opts.filenameFormatter !== undefined && typeof opts.filenameFormatter !== 'function') {
            throw new Error('filenameFormatter must be a function');
        }
        if (opts.metadataProvider !== undefined && typeof opts.metadataProvider !== 'function') {
            throw new Error('metadataProvider must be a function');
        }
        const checksumOptions = resolveChecksumOptions(opts.checksum);
        this.options = {
            blockSize: resolvedBlockSize,
            destPath: resolvedDestPath,
            filename: resolvedFilename,
            filenameFormatter: opts.filenameFormatter,
            metadataProvider: opts.metadataProvider,
            checksum: checksumOptions,
            resumeStrategy,
            concurrency
        };
        // 预先创建输出目录，确保后续写入分片时不会因目录缺失而失败
        ensureDirectorySync(this.options.destPath);
        this.chunkPrefix = crypto_1.default.randomBytes(16).toString('hex');
        if (typeof input === 'string') {
            const stat = fs_1.default.statSync(input);
            if (!stat.isFile()) {
                throw new Error(`no such file, stat '${input}'`);
            }
            // 文件模式下仅记录源文件路径与尺寸，后续统一通过文件流读取
            this.sourceType = 'file';
            this.filename = input;
            this.filesize = stat.size;
        }
        else {
            this.sourceType = 'buffer';
            // 缓存 Buffer 输入，保持零拷贝复用；若传入 ArrayBuffer 等类型则转换为 Buffer
            this.buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
            this.filename = this.options.filename;
            this.filesize = this.buffer.length;
        }
    }
    /**
     * 生成块文件名称，包含随机前缀与块序号，避免命名冲突。
     */
    formatFilename(index = 1) {
        const originalName = path_1.default.basename(this.filename);
        if (this.options.filenameFormatter) {
            const customName = this.options.filenameFormatter({
                index,
                originalName,
                sourceType: this.sourceType
            });
            if (typeof customName !== 'string' || customName.length === 0) {
                throw new Error('filenameFormatter must return a non-empty string');
            }
            return customName;
        }
        return `${this.chunkPrefix}_${index}_${originalName}`;
    }
    /**
     * 根据给定区间创建可读流。默认返回第一块数据。
     * 当读取范围越界或为空时返回空流。
     */
    slice(options = {}) {
        const defaultInterval = this.getBlockInterval(1, this.options.blockSize);
        let start = options.start ?? 0;
        let endExclusive = options.end ?? defaultInterval.end;
        // 对外接受的范围值需要限制在有效区间内，避免出现负索引或超过文件大小
        if (start < 0)
            start = 0;
        if (endExclusive > this.filesize || endExclusive === undefined) {
            endExclusive = this.filesize;
        }
        if (endExclusive <= start) {
            return stream_1.Readable.from([]);
        }
        if (this.sourceType === 'file') {
            return fs_1.default.createReadStream(this.filename, { start, end: endExclusive - 1 });
        }
        const bufferSource = this.buffer ?? Buffer.alloc(0);
        const sliceEnd = Math.min(endExclusive, bufferSource.length);
        const bufferSlice = bufferSource.subarray(start, sliceEnd);
        // Buffer 模式下将切片转成可读流，保持与文件流统一的消费方式
        if (bufferSlice.length === 0) {
            return stream_1.Readable.from([]);
        }
        return stream_1.Readable.from([bufferSlice]);
    }
    /**
     * 将指定区间写入到目标文件。
     * 写入完成 resolve，任一流出现错误会立刻中断并 reject。
     * 若启用了校验，将同步生成摘要并作为结果返回。
     */
    async sliceAsFile(filepath, readOptions = {}, writeOptions = {}) {
        if (!filepath) {
            throw new Error('require filepath');
        }
        // 确保目标文件所在目录存在，避免写流初始化时报错
        ensureDirectorySync(path_1.default.dirname(filepath));
        await this.writeSliceToFile(filepath, readOptions, writeOptions, this.options.checksum ?? null);
    }
    /**
     * 按照平均块尺寸批量生成临时文件，返回生成的文件描述信息与清理函数。
     * 支持在调用级别覆写并发、校验与续传策略。
     */
    async avgSliceAsFile(options = {}) {
        const blockNum = this.getBlockNum();
        const providedIndex = options.index;
        if (providedIndex !== undefined) {
            // index 表示从第几块开始生成文件，非正整数会造成块边界错乱
            if (!Number.isInteger(providedIndex) || providedIndex <= 0) {
                throw new Error('index must be a positive integer');
            }
        }
        const startIndex = providedIndex ?? 1;
        if (blockNum === 0 || startIndex > blockNum) {
            return {
                chunks: [],
                cleanup: async () => { }
            };
        }
        const resumeStrategy = options.resumeStrategy ?? this.options.resumeStrategy;
        if (resumeStrategy !== 'overwrite' && resumeStrategy !== 'skipExisting') {
            throw new Error("resumeStrategy must be 'overwrite' or 'skipExisting'");
        }
        const concurrency = options.concurrency ?? this.options.concurrency;
        if (!Number.isInteger(concurrency) || concurrency <= 0) {
            throw new Error('concurrency must be a positive integer');
        }
        // 由于可能指定自定义输出目录，这里与构造函数保持一致做一次兜底
        ensureDirectorySync(this.options.destPath);
        const checksumOptions = this.resolveChecksumPreference(options.checksum);
        const createdChunks = [];
        const tasks = [];
        for (let current = startIndex; current <= blockNum; current++) {
            const interval = this.getNormalizedInterval(current);
            if (interval.end <= interval.start) {
                continue;
            }
            const newFilename = path_1.default.join(this.options.destPath, this.formatFilename(current));
            tasks.push(async () => {
                const descriptor = await this.createChunkDescriptor({
                    index: current,
                    filepath: newFilename,
                    start: interval.start,
                    end: interval.end,
                    resumeStrategy,
                    checksumOptions
                });
                if (descriptor.isNew) {
                    createdChunks.push(descriptor);
                }
                return descriptor;
            });
        }
        if (tasks.length === 0) {
            return {
                chunks: [],
                cleanup: async () => { }
            };
        }
        const chunks = await runWithConcurrencyLimit(tasks, concurrency);
        const cleanup = async () => {
            if (createdChunks.length === 0)
                return;
            await this.cleanupChunks(createdChunks);
        };
        return { chunks, cleanup };
    }
    /**
     * 将文件片段顺序写入到给定的可写流。
     * 若过程中任意片段读取失败，则整体 reject 并关闭目标流。
     */
    join(filenameArray, writable, options = {}) {
        if (!Array.isArray(filenameArray)) {
            throw new Error('filenameArray must be an array');
        }
        if (filenameArray.length === 0) {
            throw new Error('filenameArray is empty');
        }
        // 在真正组装前先校验所有分片是否存在，避免写流过程中才失败
        for (const item of filenameArray) {
            const file = isChunkDescriptor(item) ? item.filepath : item;
            if (!fsExistsSync(file)) {
                throw new Error(`${file} file does not exist`);
            }
        }
        const shouldVerify = options.verify ?? false;
        return new Promise((resolve, reject) => {
            // 目标写流完成时视为整体成功，需要解除错误监听器避免内存泄漏
            const finishHandler = () => {
                writable.removeListener('error', errorHandler);
                resolve();
            };
            const errorHandler = (err) => {
                writable.removeListener('finish', finishHandler);
                reject(err);
            };
            writable.once('finish', finishHandler);
            writable.once('error', errorHandler);
            (async () => {
                const verification = shouldVerify
                    ? this.verifyChunks(filenameArray, { checksum: true })
                    : Promise.resolve();
                try {
                    await verification;
                }
                catch (error) {
                    reject(error);
                    return;
                }
                try {
                    for (const chunk of filenameArray) {
                        const file = isChunkDescriptor(chunk) ? chunk.filepath : chunk;
                        await new Promise((res, rej) => {
                            const readable = fs_1.default.createReadStream(file);
                            // 每个分片逐个串行写入，确保顺序一致，同时注意及时解除监听
                            const cleanup = () => {
                                readable.removeListener('error', onError);
                                readable.removeListener('end', onEnd);
                            };
                            const onError = (err) => {
                                cleanup();
                                readable.destroy();
                                readable.unpipe(writable);
                                rej(err);
                            };
                            const onEnd = () => {
                                cleanup();
                                readable.unpipe(writable);
                                res();
                            };
                            readable.once('error', onError);
                            readable.once('end', onEnd);
                            readable.pipe(writable, { end: false });
                        });
                    }
                    // 所有分片写入完毕后主动结束目标写流，触发 finish
                    writable.end();
                }
                catch (error) {
                    const normalizedError = error instanceof Error ? error : new Error(String(error));
                    writable.removeListener('finish', finishHandler);
                    writable.removeListener('error', errorHandler);
                    if (!writable.destroyed) {
                        writable.destroy();
                    }
                    reject(normalizedError);
                }
            })();
        });
    }
    /**
     * 语法糖：以文件路径作为目标，内部创建写流后调用 `join`。
     */
    joinAsFile(filenameArray, filepath, options = {}) {
        // 对 joinAsFile 的目标路径同样做目录兜底
        ensureDirectorySync(path_1.default.dirname(filepath));
        return this.join(filenameArray, fs_1.default.createWriteStream(filepath), options);
    }
    /**
     * 校验分片的尺寸与摘要信息。
     * 若传入纯路径数组，仅执行存在性检查；若为完整描述则同步验证尺寸与摘要。
     */
    async verifyChunks(chunks, options = {}) {
        if (!Array.isArray(chunks)) {
            throw new Error('chunks must be an array');
        }
        if (chunks.length === 0)
            return;
        const checksumPreference = this.resolveChecksumPreference(options.checksum);
        for (const chunk of chunks) {
            const filepath = isChunkDescriptor(chunk) ? chunk.filepath : chunk;
            if (!fsExistsSync(filepath)) {
                throw new Error(`${filepath} file does not exist`);
            }
            const stat = await fs_1.default.promises.stat(filepath);
            if (isChunkDescriptor(chunk) && typeof chunk.size === 'number' && chunk.size !== stat.size) {
                throw new Error(`${filepath} size mismatch`);
            }
            const expectedChecksum = isChunkDescriptor(chunk) ? chunk.checksum : undefined;
            const expectedAlgorithm = isChunkDescriptor(chunk) ? chunk.checksumAlgorithm : undefined;
            const expectedEncoding = isChunkDescriptor(chunk) ? chunk.checksumEncoding : undefined;
            const shouldVerifyChecksum = checksumPreference !== null || expectedChecksum !== undefined;
            if (!shouldVerifyChecksum) {
                continue;
            }
            const effectiveChecksumOptions = checksumPreference ?? {
                algorithm: expectedAlgorithm ?? (this.options.checksum?.algorithm ?? DEFAULT_CHECKSUM_ALGORITHM),
                encoding: expectedEncoding ?? (this.options.checksum?.encoding ?? DEFAULT_CHECKSUM_ENCODING)
            };
            const { checksum } = await this.computeChecksumFromFile(filepath, effectiveChecksumOptions);
            if (expectedChecksum && checksum !== expectedChecksum) {
                throw new Error(`${filepath} checksum mismatch`);
            }
        }
    }
    /**
     * 清理指定分片文件，忽略已缺失的文件。
     * 适用于调用 `avgSliceAsFile` 后的补充清理。
     */
    async cleanupChunks(chunks) {
        if (!Array.isArray(chunks)) {
            throw new Error('chunks must be an array');
        }
        if (chunks.length === 0)
            return;
        const unique = new Set();
        for (const chunk of chunks) {
            const filepath = isChunkDescriptor(chunk) ? chunk.filepath : chunk;
            unique.add(filepath);
        }
        await Promise.all([...unique].map(file => removeFileSafe(file)));
    }
    /**
     * 计算指定块序号对应的读取区间。
     */
    getBlockInterval(index, blockSize = this.options.blockSize) {
        const safeIndex = index <= 0 ? 1 : index;
        const start = blockSize * (safeIndex - 1);
        const end = blockSize * safeIndex;
        return { start, end };
    }
    /**
     * 根据文件大小与块尺寸估算需要处理的块数量。
     */
    getBlockNum() {
        return Math.ceil(this.filesize / this.options.blockSize);
    }
    /**
     * 为给定块索引返回已限制到文件末尾的区间。
     */
    getNormalizedInterval(index) {
        const interval = this.getBlockInterval(index, this.options.blockSize);
        return {
            start: interval.start,
            end: Math.min(interval.end, this.filesize)
        };
    }
    resolveChecksumPreference(override) {
        if (override !== undefined) {
            return resolveChecksumOptions(override);
        }
        return this.options.checksum ?? null;
    }
    /**
     * 创建单个分片描述：根据策略决定是否复用既有文件，并在必要时重新写入与生成校验。
     */
    async createChunkDescriptor(params) {
        const { index, filepath, start, end, resumeStrategy, checksumOptions } = params;
        const expectedSize = Math.max(end - start, 0);
        ensureDirectorySync(path_1.default.dirname(filepath));
        if (resumeStrategy === 'skipExisting' && fsExistsSync(filepath)) {
            const stat = fs_1.default.statSync(filepath);
            if (stat.size === expectedSize) {
                let checksum;
                let checksumEncoding;
                if (checksumOptions) {
                    const computed = await this.computeChecksumFromFile(filepath, checksumOptions);
                    checksum = computed.checksum;
                    checksumEncoding = checksumOptions.encoding;
                }
                return this.buildChunkDescriptor({
                    index,
                    start,
                    end,
                    size: stat.size,
                    filepath,
                    checksum,
                    checksumAlgorithm: checksumOptions?.algorithm,
                    checksumEncoding,
                    isNew: false
                });
            }
        }
        const { size, checksum, checksumEncoding } = await this.writeSliceToFile(filepath, { start, end }, {}, checksumOptions);
        return this.buildChunkDescriptor({
            index,
            start,
            end,
            size,
            filepath,
            checksum,
            checksumAlgorithm: checksumOptions?.algorithm,
            checksumEncoding,
            isNew: true
        });
    }
    /**
     * 基于输入构造分片描述，并合并自定义元数据。
     */
    buildChunkDescriptor(input) {
        const base = { ...input };
        const extra = this.options.metadataProvider?.(input);
        if (extra !== undefined) {
            base.metadata = extra;
        }
        return base;
    }
    /**
     * 将读取区间写入到指定文件，同时返回写入字节数与可选摘要。
     */
    writeSliceToFile(filepath, readOptions, writeOptions, checksumOptions) {
        const readable = this.slice(readOptions);
        const digest = checksumOptions ? crypto_1.default.createHash(checksumOptions.algorithm) : null;
        let bytesWritten = 0;
        return new Promise((resolve, reject) => {
            const writable = fs_1.default.createWriteStream(filepath, writeOptions);
            const cleanup = () => {
                readable.removeListener('error', onError);
                readable.removeListener('data', onData);
                writable.removeListener('error', onError);
                writable.removeListener('finish', onFinish);
            };
            const onFinish = () => {
                cleanup();
                try {
                    const checksum = digest ? digest.digest(checksumOptions?.encoding ?? DEFAULT_CHECKSUM_ENCODING) : undefined;
                    resolve({
                        size: bytesWritten,
                        checksum,
                        checksumEncoding: checksumOptions?.encoding
                    });
                }
                catch (error) {
                    reject(error);
                }
            };
            const onError = (err) => {
                cleanup();
                readable.destroy();
                writable.destroy();
                reject(err);
            };
            const onData = (chunk) => {
                bytesWritten += chunk.length;
                digest?.update(chunk);
            };
            writable.once('finish', onFinish);
            writable.once('error', onError);
            readable.once('error', onError);
            readable.on('data', onData);
            readable.pipe(writable);
        });
    }
    /**
     * 针对已存在文件计算摘要，常用于 `skipExisting` 续传场景的校验。
     */
    async computeChecksumFromFile(filepath, checksumOptions) {
        const digest = crypto_1.default.createHash(checksumOptions.algorithm);
        let totalSize = 0;
        await new Promise((resolve, reject) => {
            const readable = fs_1.default.createReadStream(filepath);
            const cleanup = () => {
                readable.removeListener('error', onError);
                readable.removeListener('data', onData);
                readable.removeListener('end', onEnd);
            };
            const onData = (chunk) => {
                totalSize += chunk.length;
                digest.update(chunk);
            };
            const onError = (err) => {
                cleanup();
                reject(err);
            };
            const onEnd = () => {
                cleanup();
                resolve();
            };
            readable.on('data', onData);
            readable.once('error', onError);
            readable.once('end', onEnd);
        });
        return {
            checksum: digest.digest(checksumOptions.encoding ?? DEFAULT_CHECKSUM_ENCODING),
            size: totalSize
        };
    }
}
exports.FsSlice = FsSlice;
/**
 * 工厂函数：创建文件切片实例，保持与早期 CommonJS 版本兼容的入口形式。
 */
const fsSlice = (filename, opts) => {
    return new FsSlice(filename, opts);
};
exports.default = fsSlice;
module.exports = fsSlice;
module.exports.default = fsSlice;
module.exports.FsSlice = FsSlice;
