export interface IFileSystem {
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string | Buffer): Promise<void>;
  appendFile(filePath: string, content: string): Promise<void>;
  move(source: string, destination: string, options?: { overwrite?: boolean }): Promise<void>;
  copy(source: string, destination: string, options?: { overwrite?: boolean }): Promise<void>;
  ensureDir(dirPath: string): Promise<void>;
  exists(filePath: string): Promise<boolean>;
  isDirectory(filePath: string): Promise<boolean>;
  listFiles(dirPath: string): Promise<string[]>;
  writeFileAtomic(filePath: string, content: string): Promise<void>;
  deleteFile(filePath: string): Promise<void>;
  acquireLock(filePath: string, retries?: number, delay?: number): Promise<() => void | Promise<void>>;
  releaseLock(filePath: string): Promise<void>;
}
