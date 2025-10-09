import fs from 'fs';
import { Readable, Writable } from 'stream';
export interface FsSliceOptions {
    blockSize?: number;
    destPath?: string;
    filename?: string;
}
export interface SliceOptions {
    start?: number;
    end?: number;
}
export interface AvgSliceOptions {
    index?: number;
}
export interface FsSliceInstance {
    slice(options?: SliceOptions): Readable;
    sliceAsFile(filepath: string, readOptions?: SliceOptions, writeOptions?: WriteStreamOptions): Promise<void>;
    avgSliceAsFile(options?: AvgSliceOptions): Promise<string[]>;
    join(filenameArray: string[], writable: Writable): Promise<void>;
    joinAsFile(filenameArray: string[], filepath: string): Promise<void>;
    formatFilename(index?: number): string;
}
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
     */
    sliceAsFile(filepath: string, readOptions?: SliceOptions, writeOptions?: WriteStreamOptions): Promise<void>;
    /**
     * 按照平均块尺寸批量生成临时文件，返回生成的文件路径列表。
     */
    avgSliceAsFile(options?: AvgSliceOptions): Promise<string[]>;
    /**
     * 将文件片段顺序写入到给定的可写流。
     * 若过程中任意片段读取失败，则整体 reject 并关闭目标流。
     */
    join(filenameArray: string[], writable: Writable): Promise<void>;
    /**
     * 语法糖：以文件路径作为目标，内部创建写流后调用 `join`。
     */
    joinAsFile(filenameArray: string[], filepath: string): Promise<void>;
    /**
     * 计算指定块序号对应的读取区间。
     */
    private getBlockInterval;
    /**
     * 根据文件大小与块尺寸估算需要处理的块数量。
     */
    private getBlockNum;
}
/**
 * 工厂函数：创建文件切片实例，保持与早期 CommonJS 版本兼容的入口形式。
 */
declare const fsSlice: (filename: string | Buffer, opts?: FsSliceOptions) => FsSliceInstance;
export { FsSlice };
export default fsSlice;
