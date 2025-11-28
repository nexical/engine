import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import type { FileSystemService as FileSystemServiceType } from '../../../src/services/FileSystemService.js';

const mockFs = {
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    ensureDirSync: jest.fn(),
    existsSync: jest.fn(),
    statSync: jest.fn(),
    readdirSync: jest.fn(),
};

jest.unstable_mockModule('fs-extra', () => ({
    default: mockFs,
    ...mockFs
}));

const { FileSystemService } = await import('../../../src/services/FileSystemService.js');

describe('FileSystemService', () => {
    let fileSystem: FileSystemServiceType;

    beforeEach(() => {
        fileSystem = new FileSystemService();
        jest.clearAllMocks();
    });

    describe('readFile', () => {
        it('should read a file successfully', () => {
            mockFs.readFileSync.mockReturnValue('content');
            const result = fileSystem.readFile('test.txt');
            expect(result).toBe('content');
            expect(mockFs.readFileSync).toHaveBeenCalledWith('test.txt', 'utf-8');
        });

        it('should return empty string on error', () => {
            mockFs.readFileSync.mockImplementation(() => { throw new Error('error'); });
            const result = fileSystem.readFile('test.txt');
            expect(result).toBe('');
        });
    });

    describe('writeFile', () => {
        it('should write a string to a file', () => {
            fileSystem.writeFile('test.txt', 'content');
            expect(mockFs.ensureDirSync).toHaveBeenCalled();
            expect(mockFs.writeFileSync).toHaveBeenCalledWith('test.txt', 'content', 'utf-8');
        });

        it('should write a buffer to a file', () => {
            const buffer = Buffer.from('content');
            fileSystem.writeFile('test.txt', buffer);
            expect(mockFs.ensureDirSync).toHaveBeenCalled();
            expect(mockFs.writeFileSync).toHaveBeenCalledWith('test.txt', buffer);
        });

        it('should handle errors gracefully', () => {
            mockFs.writeFileSync.mockImplementation(() => { throw new Error('error'); });
            expect(() => fileSystem.writeFile('test.txt', 'content')).not.toThrow();
        });
    });

    describe('ensureDir', () => {
        it('should ensure directory exists', () => {
            fileSystem.ensureDir('dir');
            expect(mockFs.ensureDirSync).toHaveBeenCalledWith('dir');
        });

        it('should handle errors gracefully', () => {
            mockFs.ensureDirSync.mockImplementation(() => { throw new Error('error'); });
            expect(() => fileSystem.ensureDir('dir')).not.toThrow();
        });
    });

    describe('exists', () => {
        it('should return true if file exists', () => {
            mockFs.existsSync.mockReturnValue(true);
            expect(fileSystem.exists('test.txt')).toBe(true);
        });

        it('should return false if file does not exist', () => {
            mockFs.existsSync.mockReturnValue(false);
            expect(fileSystem.exists('test.txt')).toBe(false);
        });
    });

    describe('isDirectory', () => {
        it('should return true if path is a directory', () => {
            mockFs.statSync.mockReturnValue({ isDirectory: () => true });
            expect(fileSystem.isDirectory('dir')).toBe(true);
        });

        it('should return false if path is not a directory', () => {
            mockFs.statSync.mockReturnValue({ isDirectory: () => false });
            expect(fileSystem.isDirectory('file')).toBe(false);
        });

        it('should return false on error', () => {
            mockFs.statSync.mockImplementation(() => { throw new Error('error'); });
            expect(fileSystem.isDirectory('invalid')).toBe(false);
        });
    });

    describe('listFiles', () => {
        it('should return list of files', () => {
            mockFs.readdirSync.mockReturnValue(['file1', 'file2']);
            expect(fileSystem.listFiles('dir')).toEqual(['file1', 'file2']);
        });

        it('should return empty list on error', () => {
            mockFs.readdirSync.mockImplementation(() => { throw new Error('error'); });
            expect(fileSystem.listFiles('dir')).toEqual([]);
        });
    });
});
