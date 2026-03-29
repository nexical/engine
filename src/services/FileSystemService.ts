import fs from 'fs-extra';
import path from 'path';

import { IFileSystem } from '../domain/IFileSystem.js';
import { IRuntimeHost } from '../domain/RuntimeHost.js';
import { SystemError } from '../errors/SystemError.js';

export class FileSystemService implements IFileSystem {
  constructor(private host: IRuntimeHost) {}

  async readFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      this.host.log('debug', `Reading file: ${String(filePath)}. Error: ${String(error)}`);
      throw SystemError.io(`Failed to read file ${filePath}`, filePath);
    }
  }

  async writeFile(filePath: string, content: string | Buffer): Promise<void> {
    try {
      await this.ensureDir(path.dirname(filePath));
      if (typeof content === 'string') {
        await fs.writeFile(filePath, content, 'utf-8');
      } else {
        await fs.writeFile(filePath, content);
      }
    } catch (error) {
      this.host.log('debug', `Writing file: ${String(filePath)}. Error: ${String(error)}`);
      throw SystemError.io(`Failed to write file ${filePath}`, filePath);
    }
  }

  async appendFile(filePath: string, content: string): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(filePath));
      await fs.appendFile(filePath, content, 'utf-8');
    } catch (error) {
      this.host.log('debug', `Appending to file: ${String(filePath)}. Error: ${String(error)}`);
      throw SystemError.io(`Failed to append to file ${filePath}`, filePath);
    }
  }

  async move(source: string, destination: string, options?: { overwrite?: boolean }): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(destination));
      await fs.move(source, destination, options);
    } catch (error) {
      this.host.log('error', `Error moving file from ${source} to ${destination}: ${String(error)}`);
      throw SystemError.io(`Failed to move file ${source} to ${destination}`, source);
    }
  }

  async copy(source: string, destination: string, options?: { overwrite?: boolean }): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(destination));
      await fs.copy(source, destination, options);
    } catch (error) {
      this.host.log('error', `Error copying file from ${source} to ${destination}: ${String(error)}`);
      throw SystemError.io(`Failed to copy file ${source} to ${destination}`, source);
    }
  }

  async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.ensureDir(dirPath);
    } catch (error) {
      this.host.log('debug', `Ensuring directory: ${String(dirPath)}. Error: ${String(error)}`);
      throw SystemError.io(`Failed to ensure directory ${dirPath}`, dirPath);
    }
  }

  async exists(filePath: string): Promise<boolean> {
    return await fs.pathExists(filePath);
  }

  async isDirectory(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  async listFiles(dirPath: string): Promise<string[]> {
    try {
      return await fs.readdir(dirPath);
    } catch (error) {
      this.host.log('debug', `Listing files in directory: ${String(dirPath)}. Error: ${String(error)}`);
      return [];
    }
  }

  async writeFileAtomic(filePath: string, content: string): Promise<void> {
    const tempPath = `${filePath}.tmp.${Math.random().toString(36).substring(7)}`;
    try {
      await this.writeFile(tempPath, content);
      await fs.rename(tempPath, filePath);
    } catch (error) {
      this.host.log('error', `Error writing atomic file ${filePath}: ${String(error)}`);
      // Try to clean up temp file
      if (await this.exists(tempPath)) {
        try {
          await fs.unlink(tempPath);
        } catch {
          // Ignore
        }
      }
      throw SystemError.io(`Failed to write atomic file ${filePath}`, filePath);
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      if (await fs.pathExists(filePath)) {
        await fs.unlink(filePath);
      }
    } catch (error) {
      this.host.log('error', `Error deleting file ${filePath}: ${String(error)}`);
      throw SystemError.io(`Failed to delete file ${filePath}`, filePath);
    }
  }

  public async acquireLock(
    filePath: string,
    retries: number = 3,
    interval: number = 100,
  ): Promise<() => Promise<void>> {
    const lockPath = `${filePath}.lock`;
    let attempts = 0;

    while (attempts <= retries) {
      try {
        const handle = await fs.open(lockPath, 'wx');
        await fs.close(handle);
        return async () => {
          await this.releaseLock(filePath);
        };
      } catch (error) {
        const err = error as { code?: string };
        if (err.code !== 'EEXIST' || (retries > 0 && attempts === retries - 1)) {
          if (err.code === 'EEXIST') {
            throw new Error(`Could not acquire lock for ${filePath} after ${retries} attempts.`);
          }
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, interval));
        attempts++;
      }
    }
    throw new Error(`Could not acquire lock for ${filePath} after ${retries} attempts.`);
  }

  async releaseLock(filePath: string): Promise<void> {
    const lockPath = `${filePath}.lock`;
    try {
      if (await fs.pathExists(lockPath)) {
        await fs.unlink(lockPath);
      }
    } catch (_e) {
      this.host.log('error', `Error releasing lock for ${filePath}: ${String(_e)}`);
    }
  }
}
