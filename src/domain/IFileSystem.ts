export interface IFileSystem {
    readFile(filePath: string): string;
    writeFile(filePath: string, content: string | Buffer): void;
    appendFile(filePath: string, content: string): void;
    move(source: string, destination: string, options?: { overwrite?: boolean }): void;
    copy(source: string, destination: string, options?: { overwrite?: boolean }): void;
    ensureDir(dirPath: string): void;
    exists(filePath: string): boolean;
    isDirectory(filePath: string): boolean;
    listFiles(dirPath: string): string[];
    writeFileAtomic(filePath: string, content: string): void;
    deleteFile(filePath: string): void;
    acquireLock(filePath: string, retries?: number, delay?: number): Promise<() => void>;
    releaseLock(filePath: string): void;
}
