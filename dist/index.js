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
        this.options = {
            blockSize: resolvedBlockSize,
            destPath: opts.destPath ?? os_1.default.tmpdir(),
            filename: opts.filename ?? `${Date.now()}`
        };
        // 预先创建输出目录，确保后续写入分片时不会因目录缺失而失败
        ensureDirectorySync(this.options.destPath);
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
        return `${crypto_1.default.randomBytes(16).toString('hex')}_${index}_${originalName}`;
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
     */
    sliceAsFile(filepath, readOptions = {}, writeOptions = {}) {
        if (!filepath) {
            throw new Error('require filepath');
        }
        // 确保目标文件所在目录存在，避免写流初始化时报错
        ensureDirectorySync(path_1.default.dirname(filepath));
        const readable = this.slice(readOptions);
        return new Promise((resolve, reject) => {
            const writable = fs_1.default.createWriteStream(filepath, writeOptions);
            // 读写流均可能在复制过程中失败，统一使用 cleanup 回收事件监听器
            const cleanup = () => {
                readable.removeListener('error', onError);
                writable.removeListener('error', onError);
                writable.removeListener('finish', onFinish);
            };
            const onFinish = () => {
                cleanup();
                resolve();
            };
            const onError = (err) => {
                cleanup();
                readable.destroy();
                writable.destroy();
                reject(err);
            };
            // 读写流均监听一次性事件，避免重复回调
            writable.once('finish', onFinish);
            writable.once('error', onError);
            readable.once('error', onError);
            readable.pipe(writable);
        });
    }
    /**
     * 按照平均块尺寸批量生成临时文件，返回生成的文件路径列表。
     */
    async avgSliceAsFile(options = {}) {
        const result = [];
        const blockNum = this.getBlockNum();
        const providedIndex = options.index;
        if (providedIndex !== undefined) {
            // index 表示从第几块开始生成文件，非正整数会造成块边界错乱
            if (!Number.isInteger(providedIndex) || providedIndex <= 0) {
                throw new Error('index must be a positive integer');
            }
        }
        const startIndex = providedIndex ?? 1;
        // 由于可能指定自定义输出目录，这里与构造函数保持一致做一次兜底
        ensureDirectorySync(this.options.destPath);
        // 顺序执行 sliceAsFile，确保生成的文件与块编号一一对应
        for (let current = startIndex; current <= blockNum; current++) {
            const newFilename = path_1.default.join(this.options.destPath, this.formatFilename(current));
            const interval = this.getBlockInterval(current, this.options.blockSize);
            await this.sliceAsFile(newFilename, interval);
            result.push(newFilename);
        }
        return result;
    }
    /**
     * 将文件片段顺序写入到给定的可写流。
     * 若过程中任意片段读取失败，则整体 reject 并关闭目标流。
     */
    join(filenameArray, writable) {
        if (!Array.isArray(filenameArray)) {
            throw new Error('filenameArray must be an array');
        }
        if (filenameArray.length === 0) {
            throw new Error('filenameArray is empty');
        }
        // 在真正组装前先校验所有分片是否存在，避免写流过程中才失败
        for (const file of filenameArray) {
            if (!fsExistsSync(file)) {
                throw new Error(`${file} file does not exist`);
            }
        }
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
                try {
                    for (const file of filenameArray) {
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
    joinAsFile(filenameArray, filepath) {
        // 对 joinAsFile 的目标路径同样做目录兜底
        ensureDirectorySync(path_1.default.dirname(filepath));
        return this.join(filenameArray, fs_1.default.createWriteStream(filepath));
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
