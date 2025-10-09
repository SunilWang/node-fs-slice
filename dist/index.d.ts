import fs from 'fs';
import crypto from 'crypto';
import { Readable, Writable } from 'stream';
export interface FsSliceOptions {
    /**
     * 单个分片的字节大小，默认为约 200 KB；必须为正整数。
     */
    blockSize?: number;
    /**
     * 分片输出目录，缺省情况下写入 `os.tmpdir()`。
     */
    destPath?: string;
    /**
     * Buffer 输入模式下使用的逻辑文件名，会参与默认命名。
     */
    filename?: string;
    /**
     * 自定义分片命名函数，入参提供索引、原始文件名及输入类型。
     */
    filenameFormatter?: (info: FilenameFormatterInfo) => string;
    /**
     * 在分片落盘后回调，可返回附加元数据并存入 `ChunkDescriptor.metadata`。
     */
    metadataProvider?: (info: ChunkMetadataInput) => Record<string, unknown> | void;
    /**
     * 是否生成分片校验值。传入对象可覆写摘要算法与编码。
     */
    checksum?: boolean | ChecksumOptions;
    /**
     * 默认的续传策略，决定遇到已存在文件时覆盖还是跳过。
     */
    resumeStrategy?: ResumeStrategy;
    /**
     * 默认并发写入数量，1 表示串行执行。
     */
    concurrency?: number;
}
export interface SliceOptions {
    /**
     * 读取的起始字节（包含），默认从 0 开始。
     */
    start?: number;
    /**
     * 读取的结束字节（排除），默认使用第一块的结束位置。
     */
    end?: number;
}
export interface AvgSliceOptions {
    /**
     * 指定起始块序号（从 1 开始），便于续切。
     */
    index?: number;
    /**
     * 针对该次调用覆写续传策略。
     */
    resumeStrategy?: ResumeStrategy;
    /**
     * 针对该次调用覆写并发写入数量。
     */
    concurrency?: number;
    /**
     * 针对该次调用覆写校验配置。
     */
    checksum?: boolean | ChecksumOptions;
}
/**
 * `join`/`joinAsFile` 的行为控制项。
 */
export interface JoinOptions {
    /**
     * 是否在合并前对所有分片重新计算校验值并比对。
     */
    verify?: boolean;
}
export interface FsSliceInstance {
    slice(options?: SliceOptions): Readable;
    sliceAsFile(filepath: string, readOptions?: SliceOptions, writeOptions?: WriteStreamOptions): Promise<void>;
    avgSliceAsFile(options?: AvgSliceOptions): Promise<AvgSliceResult>;
    join(filenameArray: ChunkInput[], writable: Writable, options?: JoinOptions): Promise<void>;
    joinAsFile(filenameArray: ChunkInput[], filepath: string, options?: JoinOptions): Promise<void>;
    verifyChunks(chunks: ChunkInput[], options?: VerifyOptions): Promise<void>;
    cleanupChunks(chunks: ChunkInput[]): Promise<void>;
    formatFilename(index?: number): string;
}
/**
 * `avgSliceAsFile` 的返回结果，包含分片描述与清理工具。
 */
export interface AvgSliceResult {
    /**
     * 本次生成的分片描述列表。
     */
    chunks: ChunkDescriptor[];
    /**
     * 清理当前调用新产生的分片文件。
     */
    cleanup(): Promise<void>;
}
export interface FilenameFormatterInfo {
    /**
     * 分片的 1 基索引。
     */
    index: number;
    /**
     * 构造名称时使用的原始文件名。
     */
    originalName: string;
    /**
     * 输入类型：`file` 或 `buffer`。
     */
    sourceType: SourceType;
}
export interface ChecksumOptions {
    /**
     * 摘要算法名称，默认 `sha256`。
     */
    algorithm?: string;
    /**
     * 摘要编码格式，默认 `hex`。
     */
    encoding?: crypto.BinaryToTextEncoding;
}
/**
 * 控制 `verifyChunks` 的校验逻辑。
 */
export interface VerifyOptions {
    /**
     * 是否执行摘要校验，可传布尔值或自定义配置。
     */
    checksum?: boolean | ChecksumOptions;
}
export interface ChunkMetadataInput {
    /**
     * 分片的 1 基序号。
     */
    index: number;
    /**
     * 起始偏移（含），相对于原始输入。
     */
    start: number;
    /**
     * 结束偏移（不含），相对于原始输入。
     */
    end: number;
    /**
     * 实际写入磁盘的字节数。
     */
    size: number;
    /**
     * 分片文件的绝对路径。
     */
    filepath: string;
    /**
     * 可选的摘要字符串。
     */
    checksum?: string;
    /**
     * 生成摘要使用的算法。
     */
    checksumAlgorithm?: string;
    /**
     * 摘要编码方式。
     */
    checksumEncoding?: crypto.BinaryToTextEncoding;
    /**
     * 是否为当前调用中新写入的分片。
     */
    isNew: boolean;
}
export interface ChunkDescriptor extends ChunkMetadataInput {
    /**
     * 由 `metadataProvider` 返回的自定义数据。
     */
    metadata?: Record<string, unknown>;
}
type ChunkInput = string | ChunkDescriptor;
type ResumeStrategy = 'overwrite' | 'skipExisting';
type SourceType = 'file' | 'buffer';
type WriteStreamOptions = Parameters<typeof fs.createWriteStream>[1];
/**
 * 文件切片工具的核心实例，封装读取、写入、合并等操作。
 * 支持从文件路径或 Buffer 构造。
 */
declare class FsSlice implements FsSliceInstance {
    private options;
    private filename;
    private filesize;
    private sourceType;
    private buffer?;
    /**
     * 每个实例共享的随机前缀，用于生成稳定的分片文件名。
     */
    private chunkPrefix;
    /**
     * @param input 可以是文件路径或直接传入的二进制 Buffer。
     * @param opts 允许指定切片尺寸、临时目录与默认文件名。
     */
    constructor(input: string | Buffer, opts?: FsSliceOptions);
    /**
     * 生成块文件名称，包含随机前缀与块序号，避免命名冲突。
     */
    formatFilename(index?: number): string;
    /**
     * 根据给定区间创建可读流。默认返回第一块数据。
     * 当读取范围越界或为空时返回空流。
     */
    slice(options?: SliceOptions): Readable;
    /**
     * 将指定区间写入到目标文件。
     * 写入完成 resolve，任一流出现错误会立刻中断并 reject。
     * 若启用了校验，将同步生成摘要并作为结果返回。
     */
    sliceAsFile(filepath: string, readOptions?: SliceOptions, writeOptions?: WriteStreamOptions): Promise<void>;
    /**
     * 按照平均块尺寸批量生成临时文件，返回生成的文件描述信息与清理函数。
     * 支持在调用级别覆写并发、校验与续传策略。
     */
    avgSliceAsFile(options?: AvgSliceOptions): Promise<AvgSliceResult>;
    /**
     * 将文件片段顺序写入到给定的可写流。
     * 若过程中任意片段读取失败，则整体 reject 并关闭目标流。
     */
    join(filenameArray: ChunkInput[], writable: Writable, options?: JoinOptions): Promise<void>;
    /**
     * 语法糖：以文件路径作为目标，内部创建写流后调用 `join`。
     */
    joinAsFile(filenameArray: ChunkInput[], filepath: string, options?: JoinOptions): Promise<void>;
    /**
     * 校验分片的尺寸与摘要信息。
     * 若传入纯路径数组，仅执行存在性检查；若为完整描述则同步验证尺寸与摘要。
     */
    verifyChunks(chunks: ChunkInput[], options?: VerifyOptions): Promise<void>;
    /**
     * 清理指定分片文件，忽略已缺失的文件。
     * 适用于调用 `avgSliceAsFile` 后的补充清理。
     */
    cleanupChunks(chunks: ChunkInput[]): Promise<void>;
    /**
     * 计算指定块序号对应的读取区间。
     */
    private getBlockInterval;
    /**
     * 根据文件大小与块尺寸估算需要处理的块数量。
     */
    private getBlockNum;
    /**
     * 为给定块索引返回已限制到文件末尾的区间。
     */
    private getNormalizedInterval;
    private resolveChecksumPreference;
    /**
     * 创建单个分片描述：根据策略决定是否复用既有文件，并在必要时重新写入与生成校验。
     */
    private createChunkDescriptor;
    /**
     * 基于输入构造分片描述，并合并自定义元数据。
     */
    private buildChunkDescriptor;
    /**
     * 将读取区间写入到指定文件，同时返回写入字节数与可选摘要。
     */
    private writeSliceToFile;
    /**
     * 针对已存在文件计算摘要，常用于 `skipExisting` 续传场景的校验。
     */
    private computeChecksumFromFile;
}
/**
 * 工厂函数：创建文件切片实例，保持与早期 CommonJS 版本兼容的入口形式。
 */
declare const fsSlice: (filename: string | Buffer, opts?: FsSliceOptions) => FsSliceInstance;
export { FsSlice };
export default fsSlice;
