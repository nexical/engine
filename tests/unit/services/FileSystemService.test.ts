import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import { FileSystemService } from '../../../src/services/FileSystemService.js';

const mockFs = {
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    appendFileSync: jest.fn(),
    moveSync: jest.fn(),
    ensureDirSync: jest.fn(),
    existsSync: jest.fn(),
    statSync: jest.fn(),
    readdirSync: jest.fn(),
};

jest.unstable_mockModule('fs-extra', () => ({ default: mockFs }));

describe('FileSystemService', () => {
    let fileSystem: FileSystemService;

    beforeEach(async () => {
        jest.resetModules();
        const { FileSystemService } = await import('../../../src/services/FileSystemService.js');
        fileSystem = new FileSystemService();
    });

    describe('readFile', () => {
        it('should read file content', () => {
            mockFs.readFileSync.mockReturnValue('content');
            expect(fileSystem.readFile('test.txt')).toBe('content');
            expect(mockFs.readFileSync).toHaveBeenCalledWith('test.txt', 'utf-8');
        });

        it('should return empty string on error', () => {
            mockFs.readFileSync.mockImplementation(() => { throw new Error('error'); });
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
            expect(fileSystem.readFile('test.txt')).toBe('');
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('writeFile', () => {
        it('should write string content', () => {
            fileSystem.writeFile('test.txt', 'content');
            expect(mockFs.ensureDirSync).toHaveBeenCalled();
            expect(mockFs.writeFileSync).toHaveBeenCalledWith('test.txt', 'content', 'utf-8');
        });

        it('should write buffer content', () => {
            const buffer = Buffer.from('content');
            fileSystem.writeFile('test.txt', buffer);
            expect(mockFs.writeFileSync).toHaveBeenCalledWith('test.txt', buffer);
        });

        it('should handle errors', () => {
            mockFs.writeFileSync.mockImplementation(() => { throw new Error('error'); });
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
            fileSystem.writeFile('test.txt', 'content');
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('appendFile', () => {
        it('should append content', () => {
            fileSystem.appendFile('test.txt', 'content');
            expect(mockFs.ensureDirSync).toHaveBeenCalled();
            expect(mockFs.appendFileSync).toHaveBeenCalledWith('test.txt', 'content', 'utf-8');
        });

        it('should handle errors', () => {
            mockFs.appendFileSync.mockImplementation(() => { throw new Error('error'); });
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
            fileSystem.appendFile('test.txt', 'content');
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('move', () => {
        it('should move file', () => {
            fileSystem.move('src', 'dest');
            expect(mockFs.ensureDirSync).toHaveBeenCalled();
            expect(mockFs.moveSync).toHaveBeenCalledWith('src', 'dest', undefined);
        });

        it('should handle errors', () => {
            mockFs.moveSync.mockImplementation(() => { throw new Error('error'); });
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
            fileSystem.move('src', 'dest');
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('ensureDir', () => {
        it('should ensure directory exists', () => {
            fileSystem.ensureDir('dir');
            expect(mockFs.ensureDirSync).toHaveBeenCalledWith('dir');
        });

        it('should handle errors', () => {
            mockFs.ensureDirSync.mockImplementation(() => { throw new Error('error'); });
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
            fileSystem.ensureDir('dir');
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('exists', () => {
        it('should check existence', () => {
            mockFs.existsSync.mockReturnValue(true);
            expect(fileSystem.exists('test.txt')).toBe(true);
            expect(mockFs.existsSync).toHaveBeenCalledWith('test.txt');
        });
    });

    describe('isDirectory', () => {
        it('should return true for directory', () => {
            mockFs.statSync.mockReturnValue({ isDirectory: () => true });
            expect(fileSystem.isDirectory('dir')).toBe(true);
        });

        it('should return false on error', () => {
            mockFs.statSync.mockImplementation(() => { throw new Error('error'); });
            expect(fileSystem.isDirectory('dir')).toBe(false);
        });
    });

    describe('listFiles', () => {
        it('should list files', () => {
            mockFs.readdirSync.mockReturnValue(['file1', 'file2']);
            expect(fileSystem.listFiles('dir')).toEqual(['file1', 'file2']);
        });

        it('should return empty array on error', () => {
            mockFs.readdirSync.mockImplementation(() => { throw new Error('error'); });
            expect(fileSystem.listFiles('dir')).toEqual([]);
        });
    });
});
