import { jest } from '@jest/globals';
import * as fs from 'fs-extra';

import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { FileSystemService as FileSystemServiceClass } from '../../../src/services/FileSystemService.js';

// Standalone mock functions to avoid unbound-method and Jest matcher errors
const mockLog = jest.fn<IRuntimeHost['log']>();
const mockStatus = jest.fn<IRuntimeHost['status']>();
const mockAsk = jest.fn<IRuntimeHost['ask']>();
const mockEmit = jest.fn<IRuntimeHost['emit']>();

const mockExistsSync = jest.fn<(...args: unknown[]) => unknown>();
const mockReadFileSync = jest.fn<(...args: unknown[]) => unknown>();
const mockWriteFileSync = jest.fn<(...args: unknown[]) => unknown>();
const mockAppendFileSync = jest.fn<(...args: unknown[]) => unknown>();
const mockEnsureDirSync = jest.fn<(...args: unknown[]) => unknown>();
const mockReaddirSync = jest.fn<(...args: unknown[]) => unknown>();
const mockRenameSync = jest.fn<(...args: unknown[]) => unknown>();
const mockUnlinkSync = jest.fn<(...args: unknown[]) => unknown>();
const mockStatSync = jest.fn<(...args: unknown[]) => unknown>();
const mockCopySync = jest.fn<(...args: unknown[]) => unknown>();
const mockMoveSync = jest.fn<(...args: unknown[]) => unknown>();
const mockOpenSync = jest.fn<(...args: unknown[]) => unknown>();
const mockCloseSync = jest.fn<(...args: unknown[]) => unknown>();
const mockRemoveSync = jest.fn<(...args: unknown[]) => unknown>();

const mockHost: jest.Mocked<IRuntimeHost> = {
  log: mockLog,
  status: mockStatus,
  ask: mockAsk,
  emit: mockEmit,
};

const mockFs = {
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  appendFileSync: mockAppendFileSync,
  ensureDirSync: mockEnsureDirSync,
  readdirSync: mockReaddirSync,
  renameSync: mockRenameSync,
  unlinkSync: mockUnlinkSync,
  statSync: mockStatSync,
  copySync: mockCopySync,
  moveSync: mockMoveSync,
  openSync: mockOpenSync,
  closeSync: mockCloseSync,
  removeSync: mockRemoveSync,
} as unknown as jest.Mocked<typeof fs>;

jest.unstable_mockModule('fs-extra', () => ({
  default: mockFs,
  ...mockFs,
}));

// Re-import to ensure it uses the mock
const { FileSystemService } = await import('../../../src/services/FileSystemService.js');

describe('FileSystemService', () => {
  let service: FileSystemServiceClass;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FileSystemService(mockHost);

    // Reset default behaviors
    mockExistsSync.mockReturnValue(false);
    mockWriteFileSync.mockReturnValue(undefined);
    mockAppendFileSync.mockReturnValue(undefined);
    mockRenameSync.mockReturnValue(undefined);
    mockEnsureDirSync.mockReturnValue(undefined);
    mockCopySync.mockReturnValue(undefined);
    mockMoveSync.mockReturnValue(undefined);
    mockUnlinkSync.mockReturnValue(undefined);
    mockCloseSync.mockReturnValue(undefined);
    mockRemoveSync.mockReturnValue(undefined);
    mockOpenSync.mockReset();
    mockReadFileSync.mockReset();
    mockReaddirSync.mockReset();
    mockStatSync.mockReset();
    mockLog.mockReset();
  });

  describe('readFile', () => {
    it('should read file content', () => {
      mockReadFileSync.mockReturnValue('content');
      expect(service.readFile('file')).toBe('content');
      expect(mockReadFileSync).toHaveBeenCalledWith('file', 'utf-8');
    });

    it('should throw error on read failure', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('fail');
      });
      expect(() => service.readFile('file')).toThrow('Failed to read file file');
      expect(mockLog).toHaveBeenCalledWith('debug', expect.stringContaining('Reading file: file'));
    });
  });

  describe('writeFile', () => {
    it('should write string content', () => {
      service.writeFile('file.txt', 'content');
      expect(mockEnsureDirSync).toHaveBeenCalled();
      expect(mockWriteFileSync).toHaveBeenCalledWith('file.txt', 'content', 'utf-8');
    });

    it('should write buffer content', () => {
      const buf = Buffer.from('content');
      service.writeFile('file.bin', buf);
      expect(mockWriteFileSync).toHaveBeenCalledWith('file.bin', buf);
    });

    it('should throw error on write failure', () => {
      mockWriteFileSync.mockImplementation(() => {
        throw new Error('fail');
      });
      expect(() => service.writeFile('file', 'content')).toThrow('Failed to write file file');
      expect(mockLog).toHaveBeenCalledWith('debug', expect.stringContaining('Writing file: file'));
    });
  });

  describe('appendFile', () => {
    it('should append content', () => {
      service.appendFile('file', 'more');
      expect(mockEnsureDirSync).toHaveBeenCalled();
      expect(mockAppendFileSync).toHaveBeenCalledWith('file', 'more', 'utf-8');
    });

    it('should throw error on append failure', () => {
      mockAppendFileSync.mockImplementation(() => {
        throw new Error('fail');
      });
      expect(() => service.appendFile('file', 'content')).toThrow('Failed to append to file file');
      expect(mockLog).toHaveBeenCalledWith('debug', expect.stringContaining('Appending to file: file'));
    });
  });

  describe('move/copy', () => {
    it('should move file', () => {
      service.move('src', 'dest', { overwrite: true });
      expect(mockEnsureDirSync).toHaveBeenCalled();
      expect(mockMoveSync).toHaveBeenCalledWith('src', 'dest', { overwrite: true });
    });

    it('should throw on move failure', () => {
      mockMoveSync.mockImplementation(() => {
        throw new Error('fail');
      });
      expect(() => service.move('src', 'dest')).toThrow('Failed to move file src to dest');
      expect(mockLog).toHaveBeenCalledWith('error', expect.stringContaining('Error moving file from src to dest'));
    });

    it('should copy file', () => {
      service.copy('src', 'dest');
      expect(mockEnsureDirSync).toHaveBeenCalled();
      expect(mockCopySync).toHaveBeenCalledWith('src', 'dest', undefined);
    });

    it('should throw on copy failure', () => {
      mockCopySync.mockImplementation(() => {
        throw new Error('fail');
      });
      expect(() => service.copy('src', 'dest')).toThrow('Failed to copy file src to dest');
      expect(mockLog).toHaveBeenCalledWith('error', expect.stringContaining('Error copying file from src to dest'));
    });
  });

  describe('ensureDir/exists/isDirectory', () => {
    it('should ensure dir', () => {
      service.ensureDir('dir');
      expect(mockEnsureDirSync).toHaveBeenCalledWith('dir');
    });

    it('should throw error on ensureDir failure', () => {
      mockEnsureDirSync.mockImplementation(() => {
        throw new Error('fail');
      });
      expect(() => service.ensureDir('dir')).toThrow('Failed to ensure directory dir');
      expect(mockLog).toHaveBeenCalledWith('debug', expect.stringContaining('Ensuring directory: dir'));
    });

    it('should check exists', () => {
      mockExistsSync.mockReturnValue(true);
      expect(service.exists('file')).toBe(true);
      expect(mockExistsSync).toHaveBeenCalledWith('file');
    });

    it('should check isDirectory', () => {
      mockStatSync.mockReturnValue({ isDirectory: () => true });
      expect(service.isDirectory('dir')).toBe(true);
      expect(mockStatSync).toHaveBeenCalledWith('dir');
    });

    it('should return false if stat fails', () => {
      mockStatSync.mockImplementation(() => {
        throw new Error('noent');
      });
      expect(service.isDirectory('dir')).toBe(false);
    });
  });

  describe('listFiles', () => {
    it('should return files', () => {
      mockReaddirSync.mockReturnValue(['a', 'b']);
      expect(service.listFiles('dir')).toEqual(['a', 'b']);
      expect(mockReaddirSync).toHaveBeenCalledWith('dir');
    });

    it('should return empty array and warn on failure', () => {
      mockReaddirSync.mockImplementation(() => {
        throw new Error('fail');
      });
      expect(service.listFiles('dir')).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith('debug', expect.stringContaining('Listing files in directory: dir'));
    });
  });

  describe('writeFileAtomic', () => {
    it('should write to temp and rename', () => {
      // Explicitly ensure success returns
      mockWriteFileSync.mockReturnValue(undefined);
      mockRenameSync.mockReturnValue(undefined);

      service.writeFileAtomic('file', 'content');

      expect(mockWriteFileSync).toHaveBeenCalledWith(expect.stringContaining('file.tmp'), 'content', 'utf-8');
      expect(mockRenameSync).toHaveBeenCalledWith(expect.stringContaining('file.tmp'), 'file');
    });

    it('should cleanup temp file on error', () => {
      mockRenameSync.mockImplementation(() => {
        throw new Error('fail');
      });
      mockExistsSync.mockReturnValue(true); // Temp file exists

      expect(() => service.writeFileAtomic('file', 'content')).toThrow('Failed to write atomic file file');
      expect(mockUnlinkSync).toHaveBeenCalled();
    });

    it('should handle atomic write failure with no temp file', () => {
      mockRenameSync.mockImplementation(() => {
        throw new Error('fail');
      });
      mockExistsSync.mockReturnValue(false); // Temp file missing

      expect(() => service.writeFileAtomic('file', 'content')).toThrow('Failed to write atomic file file');
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('deleteFile', () => {
    it('should delete existing file', () => {
      mockExistsSync.mockReturnValue(true);
      service.deleteFile('file');
      expect(mockUnlinkSync).toHaveBeenCalledWith('file');
    });

    it('should do nothing if file missing', () => {
      mockExistsSync.mockReturnValue(false);
      service.deleteFile('file');
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });

    it('should throw on delete failure', () => {
      mockExistsSync.mockReturnValue(true);
      mockUnlinkSync.mockImplementation(() => {
        throw new Error('fail');
      });
      expect(() => service.deleteFile('file')).toThrow('Failed to delete file file');
      expect(mockLog).toHaveBeenCalledWith('error', expect.stringContaining('Error deleting file file:'));
    });
  });

  describe('locking', () => {
    it('should acquire and release lock', async () => {
      // Mock success on first try
      mockOpenSync.mockReturnValue(123);
      mockExistsSync.mockReturnValue(true); // For unlock check

      const unlock = await service.acquireLock('file');

      expect(mockOpenSync).toHaveBeenCalledWith('file.lock', 'wx');
      expect(mockCloseSync).toHaveBeenCalledWith(123);
      expect(typeof unlock).toBe('function');

      unlock();
      expect(mockUnlinkSync).toHaveBeenCalledWith('file.lock');
    });

    it('should retry acquiring lock', async () => {
      mockOpenSync
        .mockImplementationOnce(() => {
          throw Object.assign(new Error('exists'), { code: 'EEXIST' });
        })
        .mockReturnValueOnce(123);

      const unlock = await service.acquireLock('file', 3, 10);
      expect(mockOpenSync).toHaveBeenCalledTimes(2);
      expect(typeof unlock).toBe('function');
    });

    it('should throw after max retries', async () => {
      mockOpenSync.mockImplementation(() => {
        throw Object.assign(new Error('exists'), { code: 'EEXIST' });
      });
      await expect(service.acquireLock('file', 2, 10)).rejects.toThrow(
        'Could not acquire lock for file after 2 attempts.',
      );
    });

    it('should throw immediately if retries is 0', async () => {
      mockOpenSync.mockImplementation(() => {
        throw Object.assign(new Error('exists'), { code: 'EEXIST' });
      });
      await expect(service.acquireLock('file', 0)).rejects.toThrow('Could not acquire lock for file');
    });

    it('should rethrow non-EEXIST errors', async () => {
      mockOpenSync.mockImplementation(() => {
        throw new Error('other error');
      });
      await expect(service.acquireLock('file')).rejects.toThrow('other error');
    });

    it('should release existing lock', () => {
      mockExistsSync.mockReturnValue(true);
      service.releaseLock('file');
      expect(mockUnlinkSync).toHaveBeenCalledWith('file.lock');
    });

    it('should log error if release fails', () => {
      mockExistsSync.mockReturnValue(true);
      mockUnlinkSync.mockImplementation(() => {
        throw new Error('fail');
      });

      service.releaseLock('file');
      expect(mockLog).toHaveBeenCalledWith('error', expect.stringContaining('Error releasing lock for file:'));
    });

    it('should do nothing if release called on non-existent lock', () => {
      mockExistsSync.mockReturnValue(false);
      service.releaseLock('file');
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });
  });
});
