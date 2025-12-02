import fs from 'fs-extra';
import path from 'path';

export class FileSystemService {
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
}
