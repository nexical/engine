import fs from 'fs-extra';
import path from 'path';
import { IFileSystem } from '../domain/IFileSystem.js';

export class FileSystemService implements IFileSystem {
    readFile(filePath: string): string {
        try {
            return fs.readFileSync(filePath, 'utf-8');
        } catch (error) {
            console.error(`Error reading file ${filePath}:`, error);
            return '';
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
            console.error(`Error writing file ${filePath}:`, error);
        }
    }

    appendFile(filePath: string, content: string): void {
        try {
            fs.ensureDirSync(path.dirname(filePath));
            fs.appendFileSync(filePath, content, 'utf-8');
        } catch (error) {
            console.error(`Error appending to file ${filePath}:`, error);
        }
    }

    move(source: string, destination: string, options?: { overwrite?: boolean }): void {
        try {
            fs.ensureDirSync(path.dirname(destination));
            fs.moveSync(source, destination, options);
        } catch (error) {
            console.error(`Error moving file from ${source} to ${destination}:`, error);
        }
    }

    copy(source: string, destination: string, options?: { overwrite?: boolean }): void {
        try {
            fs.ensureDirSync(path.dirname(destination));
            fs.copySync(source, destination, options);
        } catch (error) {
            console.error(`Error copying file from ${source} to ${destination}:`, error);
        }
    }

    ensureDir(dirPath: string): void {
        try {
            fs.ensureDirSync(dirPath);
        } catch (error) {
            console.error(`Error ensuring directory ${dirPath}:`, error);
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
        } catch {
            return [];
        }
    }

    writeFileAtomic(filePath: string, content: string): void {
        const tempPath = `${filePath}.tmp.${Math.random().toString(36).substring(7)}`;
        try {
            this.writeFile(tempPath, content);
            fs.renameSync(tempPath, filePath);
        } catch (error) {
            console.error(`Error writing atomic file ${filePath}:`, error);
            // Try to clean up temp file
            if (this.exists(tempPath)) {
                try {
                    fs.unlinkSync(tempPath);
                } catch (e) {
                    // Ignore
                }
            }
            throw error;
        }
    }

    deleteFile(filePath: string): void {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (error) {
            console.error(`Error deleting file ${filePath}:`, error);
        }
    }

    async acquireLock(filePath: string, retries = 10, delay = 100): Promise<() => void> {
        const lockPath = `${filePath}.lock`;
        for (let i = 0; i < retries; i++) {
            try {
                // exclusive flag 'wx' ensures we fail if file exists
                fs.closeSync(fs.openSync(lockPath, 'wx'));
                return () => this.releaseLock(filePath);
            } catch (e) {
                if (i === retries - 1) {
                    throw new Error(`Could not acquire lock for ${filePath} after ${retries} attempts.`);
                }
                await new Promise(resolve => setTimeout(resolve, delay));
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
        } catch (e) {
            console.error(`Error releasing lock for ${filePath}:`, e);
        }
    }
}
