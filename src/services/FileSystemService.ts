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
            fs.ensureDirSync(path.dirname(filePath));
            if (Buffer.isBuffer(content)) {
                fs.writeFileSync(filePath, content);
            } else {
                fs.writeFileSync(filePath, content, 'utf-8');
            }
        } catch (error) {
            console.error(`Error writing file ${filePath}:`, error);
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
}
