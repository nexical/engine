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

    writeFile(filePath: string, content: string): void {
        try {
            fs.ensureDirSync(path.dirname(filePath));
            fs.writeFileSync(filePath, content, 'utf-8');
        } catch (error) {
            console.error(`Error writing file ${filePath}:`, error);
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
