import { jest } from '@jest/globals';
import * as fs from 'fs-extra';

import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { FileSystemService as FileSystemServiceClass } from '../../../src/services/FileSystemService.js';

// Standalone mock functions to avoid unbound-method and Jest matcher errors
const mockLog = jest.fn<IRuntimeHost['log']>();
const mockStatus = jest.fn<IRuntimeHost['status']>();
const mockAsk = jest.fn<IRuntimeHost['ask']>();
const mockEmit = jest.fn<IRuntimeHost['emit']>();

const mockExistsSync = jest.fn<(...args: unknown[]) => Promise<boolean>>();
const mockReadFileSync = jest.fn<(...args: unknown[]) => Promise<string>>();
const mockWriteFileSync = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockAppendFileSync = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockEnsureDirSync = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockReaddirSync = jest.fn<(...args: unknown[]) => Promise<string[]>>();
const mockRenameSync = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockUnlinkSync = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockStatSync = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCopySync = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockMoveSync = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockOpenSync = jest.fn<(...args: unknown[]) => Promise<number>>();
const mockCloseSync = jest.fn<(...args: unknown[]) => Promise<void>>();

const mockHost: jest.Mocked<IRuntimeHost> = {
  log: mockLog,
  status: mockStatus,
  ask: mockAsk,
  emit: mockEmit,
};

const mockFs = {
  existsSync: mockExistsSync,
  exists: mockExistsSync,
  pathExists: mockExistsSync,
  pathExistsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  readFile: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  writeFile: mockWriteFileSync,
  appendFileSync: mockAppendFileSync,
  appendFile: mockAppendFileSync,
  ensureDirSync: mockEnsureDirSync,
  ensureDir: mockEnsureDirSync,
  readdirSync: mockReaddirSync,
  readdir: mockReaddirSync,
  renameSync: mockRenameSync,
  rename: mockRenameSync,
  unlinkSync: mockUnlinkSync,
  unlink: mockUnlinkSync,
  removeSync: mockUnlinkSync,
  remove: mockUnlinkSync,
  statSync: mockStatSync,
  stat: mockStatSync,
  copySync: mockCopySync,
  copy: mockCopySync,
  moveSync: mockMoveSync,
  move: mockMoveSync,
  openSync: mockOpenSync,
  open: mockOpenSync,
  closeSync: mockCloseSync,
  close: mockCloseSync,
} as unknown as jest.Mocked<typeof fs>;

jest.unstable_mockModule('fs-extra', () => ({
  ...mockFs,
  default: mockFs,
}));

// Re-import to ensure it uses the mock
const { FileSystemService } = await import('../../../src/services/FileSystemService.js');

describe('FileSystemService', () => {
  let service: FileSystemServiceClass;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockResolvedValue(false);
    mockReadFileSync.mockResolvedValue('content');
    mockWriteFileSync.mockResolvedValue(undefined);
    mockAppendFileSync.mockResolvedValue(undefined);
    mockEnsureDirSync.mockResolvedValue(undefined);
    mockReaddirSync.mockResolvedValue([]);
    mockRenameSync.mockResolvedValue(undefined);
    mockUnlinkSync.mockResolvedValue(undefined);
    mockStatSync.mockResolvedValue({ isDirectory: () => false });
    mockCopySync.mockResolvedValue(undefined);
    mockMoveSync.mockResolvedValue(undefined);
    mockOpenSync.mockResolvedValue(1);
    mockCloseSync.mockResolvedValue(undefined);
    service = new FileSystemService(mockHost);
  });

  describe('readFile', () => {
    it('should read file content', async () => {
      mockReadFileSync.mockResolvedValue('content');
      expect(await service.readFile('file')).toBe('content');
      expect(mockReadFileSync).toHaveBeenCalledWith('file', 'utf-8');
    });

    it('should throw error on read failure', async () => {
      mockReadFileSync.mockImplementation(() => {
        return Promise.reject(new Error('fail'));
      });
      await expect(service.readFile('file')).rejects.toThrow('Failed to read file file');
      expect(mockLog).toHaveBeenCalledWith('debug', expect.stringContaining('Reading file: file'));
    });
  });

  describe('writeFile', () => {
    it('should write string content', async () => {
      await service.writeFile('file.txt', 'content');
      expect(mockEnsureDirSync).toHaveBeenCalled();
      expect(mockWriteFileSync).toHaveBeenCalledWith('file.txt', 'content', 'utf-8');
    });

    it('should write buffer content', async () => {
      const buf = Buffer.from('content');
      await service.writeFile('file.bin', buf);
      expect(mockWriteFileSync).toHaveBeenCalledWith('file.bin', buf);
    });

    it('should throw error on write failure', async () => {
      mockWriteFileSync.mockImplementation(() => {
        return Promise.reject(new Error('fail'));
      });
      await expect(service.writeFile('file', 'content')).rejects.toThrow('Failed to write file file');
      expect(mockLog).toHaveBeenCalledWith('debug', expect.stringContaining('Writing file: file'));
    });
  });

  describe('appendFile', () => {
    it('should append content', async () => {
      await service.appendFile('file', 'more');
      expect(mockEnsureDirSync).toHaveBeenCalled();
      expect(mockAppendFileSync).toHaveBeenCalledWith('file', 'more', 'utf-8');
    });

    it('should throw error on append failure', async () => {
      mockAppendFileSync.mockImplementation(() => {
        return Promise.reject(new Error('fail'));
      });
      await expect(service.appendFile('file', 'content')).rejects.toThrow('Failed to append to file file');
      expect(mockLog).toHaveBeenCalledWith('debug', expect.stringContaining('Appending to file: file'));
    });
  });

  describe('move/copy', () => {
    it('should move file', async () => {
      await service.move('src', 'dest', { overwrite: true });
      expect(mockEnsureDirSync).toHaveBeenCalled();
      expect(mockMoveSync).toHaveBeenCalledWith('src', 'dest', { overwrite: true });
    });

    it('should throw on move failure', async () => {
      mockMoveSync.mockImplementation(() => {
        return Promise.reject(new Error('fail'));
      });
      await expect(service.move('src', 'dest')).rejects.toThrow('Failed to move file src to dest');
      expect(mockLog).toHaveBeenCalledWith('error', expect.stringContaining('Error moving file from src to dest'));
    });

    it('should copy file', async () => {
      await service.copy('src', 'dest');
      expect(mockEnsureDirSync).toHaveBeenCalled();
      expect(mockCopySync).toHaveBeenCalledWith('src', 'dest', undefined);
    });

    it('should throw on copy failure', async () => {
      mockCopySync.mockImplementation(() => {
        return Promise.reject(new Error('fail'));
      });
      await expect(service.copy('src', 'dest')).rejects.toThrow('Failed to copy file src to dest');
      expect(mockLog).toHaveBeenCalledWith('error', expect.stringContaining('Error copying file from src to dest'));
    });
  });

  describe('ensureDir/exists/isDirectory', () => {
    it('should ensure dir', async () => {
      await service.ensureDir('dir');
      expect(mockEnsureDirSync).toHaveBeenCalledWith('dir');
    });

    it('should throw error on ensureDir failure', async () => {
      mockEnsureDirSync.mockImplementation(() => {
        return Promise.reject(new Error('fail'));
      });
      await expect(service.ensureDir('dir')).rejects.toThrow('Failed to ensure directory dir');
      expect(mockLog).toHaveBeenCalledWith('debug', expect.stringContaining('Ensuring directory: dir'));
    });

    it('should check exists', async () => {
      mockExistsSync.mockResolvedValue(true);
      expect(await service.exists('file')).toBe(true);
      expect(mockExistsSync).toHaveBeenCalledWith('file');
    });

    it('should check isDirectory', async () => {
      mockStatSync.mockResolvedValue({ isDirectory: () => true });
      expect(await service.isDirectory('dir')).toBe(true);
      expect(mockStatSync).toHaveBeenCalledWith('dir');
    });

    it('should return false if stat fails', async () => {
      mockStatSync.mockImplementation(() => {
        return Promise.reject(new Error('noent'));
      });
      expect(await service.isDirectory('dir')).toBe(false);
    });
  });

  describe('listFiles', () => {
    it('should return files', async () => {
      mockReaddirSync.mockResolvedValue(['a', 'b']);
      expect(await service.listFiles('dir')).toEqual(['a', 'b']);
      expect(mockReaddirSync).toHaveBeenCalledWith('dir');
    });

    it('should return empty array and warn on failure', async () => {
      mockReaddirSync.mockImplementation(() => {
        return Promise.reject(new Error('fail'));
      });
      expect(await service.listFiles('dir')).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith('debug', expect.stringContaining('Listing files in directory: dir'));
    });
  });

  describe('writeFileAtomic', () => {
    it('should write to temp and rename', async () => {
      // Explicitly ensure success returns
      mockWriteFileSync.mockResolvedValue(undefined);
      mockRenameSync.mockResolvedValue(undefined);

      await service.writeFileAtomic('file', 'content');

      expect(mockWriteFileSync).toHaveBeenCalledWith(expect.stringContaining('file.tmp'), 'content', 'utf-8');
      expect(mockRenameSync).toHaveBeenCalledWith(expect.stringContaining('file.tmp'), 'file');
    });

    it('should cleanup temp file on error', async () => {
      mockRenameSync.mockImplementation(() => {
        return Promise.reject(new Error('fail'));
      });
      mockExistsSync.mockResolvedValue(true); // Temp file exists
      mockUnlinkSync.mockResolvedValue(undefined);

      await expect(service.writeFileAtomic('file', 'content')).rejects.toThrow('Failed to write atomic file file');
      expect(mockUnlinkSync).toHaveBeenCalled();
    });

    it('should handle atomic write failure with no temp file', async () => {
      mockRenameSync.mockImplementation(() => {
        return Promise.reject(new Error('fail'));
      });
      mockExistsSync.mockResolvedValue(false); // Temp file missing

      await expect(service.writeFileAtomic('file', 'content')).rejects.toThrow('Failed to write atomic file file');
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('deleteFile', () => {
    it('should delete existing file', async () => {
      mockExistsSync.mockResolvedValue(true);
      mockUnlinkSync.mockResolvedValue(undefined);
      await service.deleteFile('file');
      expect(mockUnlinkSync).toHaveBeenCalledWith('file');
    });

    it('should do nothing if file missing', async () => {
      mockExistsSync.mockResolvedValue(false);
      await service.deleteFile('file');
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });

    it('should throw on delete failure', async () => {
      mockExistsSync.mockResolvedValue(true);
      mockUnlinkSync.mockImplementation(() => {
        return Promise.reject(new Error('fail'));
      });
      await expect(service.deleteFile('file')).rejects.toThrow('Failed to delete file file');
      expect(mockLog).toHaveBeenCalledWith('error', expect.stringContaining('Error deleting file file:'));
    });
  });

  describe('locking', () => {
    it('should acquire and release lock', async () => {
      // Mock success on first try
      mockOpenSync.mockResolvedValue(123);
      mockExistsSync.mockResolvedValue(true); // For unlock check
      mockCloseSync.mockResolvedValue(undefined);
      mockUnlinkSync.mockResolvedValue(undefined);

      const unlock = await service.acquireLock('file');

      expect(mockOpenSync).toHaveBeenCalledWith('file.lock', 'wx');
      expect(mockCloseSync).toHaveBeenCalledWith(123);
      expect(typeof unlock).toBe('function');

      await (unlock as () => Promise<void>)();
      expect(mockUnlinkSync).toHaveBeenCalledWith('file.lock');
    });

    it('should retry acquiring lock', async () => {
      mockOpenSync
        .mockImplementationOnce(() => {
          return Promise.reject(Object.assign(new Error('exists'), { code: 'EEXIST' }));
        })
        .mockResolvedValueOnce(123);
      mockCloseSync.mockResolvedValue(undefined);

      const unlock = await service.acquireLock('file', 3, 10);
      expect(mockOpenSync).toHaveBeenCalledTimes(2);
      expect(typeof unlock).toBe('function');
    });

    it('should throw after max retries', async () => {
      mockOpenSync.mockImplementation(() => {
        return Promise.reject(Object.assign(new Error('exists'), { code: 'EEXIST' }));
      });
      await expect(service.acquireLock('file', 2, 10)).rejects.toThrow(
        'Could not acquire lock for file after 2 attempts.',
      );
    });

    it('should throw immediately if retries is 0', async () => {
      mockOpenSync.mockImplementation(() => {
        return Promise.reject(Object.assign(new Error('exists'), { code: 'EEXIST' }));
      });
      await expect(service.acquireLock('file', 0)).rejects.toThrow('Could not acquire lock for file');
    });

    it('should rethrow non-EEXIST errors', async () => {
      mockOpenSync.mockImplementation(() => {
        return Promise.reject(new Error('other error'));
      });
      await expect(service.acquireLock('file')).rejects.toThrow('other error');
    });

    it('should release existing lock', async () => {
      mockExistsSync.mockResolvedValue(true);
      mockUnlinkSync.mockResolvedValue(undefined);
      await service.releaseLock('file');
      expect(mockUnlinkSync).toHaveBeenCalledWith('file.lock');
    });

    it('should log error if release fails', async () => {
      mockExistsSync.mockResolvedValue(true);
      mockUnlinkSync.mockImplementation(() => {
        return Promise.reject(new Error('fail'));
      });

      await service.releaseLock('file');
      expect(mockLog).toHaveBeenCalledWith('error', expect.stringContaining('Error releasing lock for file:'));
    });

    it('should catch error on unlock unlink', async () => {
      mockOpenSync.mockResolvedValue(123);
      mockCloseSync.mockResolvedValue(undefined);
      mockExistsSync.mockResolvedValue(true);
      mockUnlinkSync.mockImplementation(() => {
        return Promise.reject(new Error('fail'));
      });

      const unlock = await service.acquireLock('file');
      await (unlock as () => Promise<void>)();
      expect(mockLog).toHaveBeenCalledWith('error', expect.stringContaining('Error releasing lock for file:'));
    });
  });
});
