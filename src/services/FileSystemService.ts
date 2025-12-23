import fs from 'fs-extra';
import path from 'path';

import { IFileSystem } from '../domain/IFileSystem.js';
import { IRuntimeHost } from '../domain/RuntimeHost.js';
import { SystemError } from '../errors/SystemError.js';

export class FileSystemService implements IFileSystem {
  constructor(private host: IRuntimeHost) {}

  readFile(filePath: string): string {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      this.host.log('debug', `Reading file: ${String(filePath)}. Error: ${String(error)}`);
      throw SystemError.io(`Failed to read file ${filePath}`, filePath);
    }
  }

  writeFile(filePath: string, content: string | Buffer): void {
    try {
      this.ensureDir(path.dirname(filePath));
      if (typeof content === 'string') {
        fs.writeFileSync(filePath, content, 'utf-8');
      } else {
        fs.writeFileSync(filePath, content);
      }
    } catch (error) {
      this.host.log('debug', `Writing file: ${String(filePath)}. Error: ${String(error)}`);
      throw SystemError.io(`Failed to write file ${filePath}`, filePath);
    }
  }

  appendFile(filePath: string, content: string): void {
    try {
      fs.ensureDirSync(path.dirname(filePath));
      fs.appendFileSync(filePath, content, 'utf-8');
    } catch (error) {
      this.host.log('debug', `Appending to file: ${String(filePath)}. Error: ${String(error)}`);
      throw SystemError.io(`Failed to append to file ${filePath}`, filePath);
    }
  }

  move(source: string, destination: string, options?: { overwrite?: boolean }): void {
    try {
      fs.ensureDirSync(path.dirname(destination));
      fs.moveSync(source, destination, options);
    } catch (error) {
      this.host.log('error', `Error moving file from ${source} to ${destination}: ${String(error)}`);
      throw SystemError.io(`Failed to move file ${source} to ${destination}`, source);
    }
  }

  copy(source: string, destination: string, options?: { overwrite?: boolean }): void {
    try {
      fs.ensureDirSync(path.dirname(destination));
      fs.copySync(source, destination, options);
    } catch (error) {
      this.host.log('error', `Error copying file from ${source} to ${destination}: ${String(error)}`);
      throw SystemError.io(`Failed to copy file ${source} to ${destination}`, source);
    }
  }

  ensureDir(dirPath: string): void {
    try {
      fs.ensureDirSync(dirPath);
    } catch (error) {
      this.host.log('debug', `Ensuring directory: ${String(dirPath)}. Error: ${String(error)}`);
      throw SystemError.io(`Failed to ensure directory ${dirPath}`, dirPath);
    }
  }

  exists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  isDirectory(filePath: string): boolean {
    try {
      return fs.statSync(filePath).isDirectory();
    } catch {
      return false;
    }
  }

  listFiles(dirPath: string): string[] {
    try {
      return fs.readdirSync(dirPath);
    } catch (error) {
      // We usually return empty array for listing failure in loose checks, but strict mode should throw?
      // Keeping safe behavior for now but logging
      this.host.log('debug', `Listing files in directory: ${String(dirPath)}. Error: ${String(error)}`);
      return [];
    }
  }

  writeFileAtomic(filePath: string, content: string): void {
    const tempPath = `${filePath}.tmp.${Math.random().toString(36).substring(7)}`;
    try {
      this.writeFile(tempPath, content);
      fs.renameSync(tempPath, filePath);
    } catch (error) {
      this.host.log('error', `Error writing atomic file ${filePath}: ${String(error)}`);
      // Try to clean up temp file
      if (this.exists(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // Ignore
        }
      }
      throw SystemError.io(`Failed to write atomic file ${filePath}`, filePath);
    }
  }

  deleteFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      this.host.log('error', `Error deleting file ${filePath}: ${String(error)}`);
      throw SystemError.io(`Failed to delete file ${filePath}`, filePath);
    }
  }

  async acquireLock(filePath: string, retries = 10, delay = 100): Promise<() => void> {
    const lockPath = `${filePath}.lock`;
    for (let i = 0; i < retries; i++) {
      try {
        // exclusive flag 'wx' ensures we fail if file exists
        fs.closeSync(fs.openSync(lockPath, 'wx'));
        return () => this.releaseLock(filePath);
      } catch {
        if (i === retries - 1) {
          throw new Error(`Could not acquire lock for ${filePath} after ${retries} attempts.`);
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new Error(`Could not acquire lock for ${filePath}`);
  }

  releaseLock(filePath: string): void {
    const lockPath = `${filePath}.lock`;
    try {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
    } catch (_e) {
      this.host.log('error', `Error releasing lock for ${filePath}: ${String(_e)}`);
    }
  }
}
