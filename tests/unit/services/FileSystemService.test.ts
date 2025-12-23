import { jest } from '@jest/globals';

import { SystemError } from '../../../src/errors/SystemError.js';

const mockFs = {
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn().mockReturnValue(undefined),
  appendFileSync: jest.fn().mockReturnValue(undefined),
  ensureDirSync: jest.fn().mockReturnValue(undefined),
  readdirSync: jest.fn(),
  renameSync: jest.fn().mockReturnValue(undefined),
  unlinkSync: jest.fn().mockReturnValue(undefined),
  statSync: jest.fn(),
  copySync: jest.fn().mockReturnValue(undefined),
  moveSync: jest.fn().mockReturnValue(undefined),
  openSync: jest.fn(),
  closeSync: jest.fn().mockReturnValue(undefined),
};

jest.unstable_mockModule('fs-extra', () => ({
  default: mockFs,
  ...mockFs,
}));

const { FileSystemService } = await import('../../../src/services/FileSystemService.js');

describe('FileSystemService', () => {
  let service: InstanceType<typeof FileSystemService>;
  let mockHost: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockHost = { log: jest.fn() };
    service = new FileSystemService(mockHost);

    // Reset default behaviors
    mockFs.existsSync.mockReturnValue(false);
    mockFs.writeFileSync.mockReturnValue(undefined);
    mockFs.renameSync.mockReturnValue(undefined);
    mockFs.ensureDirSync.mockReturnValue(undefined);
    mockFs.openSync.mockReset();
  });

  describe('readFile', () => {
    it('should read file content', () => {
      mockFs.readFileSync.mockReturnValue('content');
      expect(service.readFile('file')).toBe('content');
      expect(mockFs.readFileSync).toHaveBeenCalledWith('file', 'utf-8');
    });

    it('should throw SystemError on read failure', () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('fail');
      });
      expect(() => service.readFile('file')).toThrow(SystemError);
      expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Error reading file'));
    });
  });

  describe('writeFile', () => {
    it('should write string content', () => {
      service.writeFile('file.txt', 'content');
      expect(mockFs.ensureDirSync).toHaveBeenCalled();
      expect(mockFs.writeFileSync).toHaveBeenCalledWith('file.txt', 'content', 'utf-8');
    });

    it('should write buffer content', () => {
      const buf = Buffer.from('content');
      service.writeFile('file.bin', buf);
      expect(mockFs.writeFileSync).toHaveBeenCalledWith('file.bin', buf);
    });

    it('should throw SystemError on write failure', () => {
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('fail');
      });
      expect(() => service.writeFile('file', 'content')).toThrow(SystemError);
      expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Error writing file'));
    });
  });

  describe('appendFile', () => {
    it('should append content', () => {
      service.appendFile('file', 'more');
      expect(mockFs.ensureDirSync).toHaveBeenCalled();
      expect(mockFs.appendFileSync).toHaveBeenCalledWith('file', 'more', 'utf-8');
    });

    it('should throw error on append failure', () => {
      mockFs.appendFileSync.mockImplementation(() => {
        throw new Error('fail');
      });
      expect(() => service.appendFile('file', 'content')).toThrow(SystemError);
    });
  });

  describe('move/copy', () => {
    it('should move file', () => {
      service.move('src', 'dest', { overwrite: true });
      expect(mockFs.ensureDirSync).toHaveBeenCalled();
      expect(mockFs.moveSync).toHaveBeenCalledWith('src', 'dest', { overwrite: true });
    });

    it('should throw on move failure', () => {
      mockFs.moveSync.mockImplementation(() => {
        throw new Error('fail');
      });
      expect(() => service.move('src', 'dest')).toThrow(SystemError);
    });

    it('should copy file', () => {
      service.copy('src', 'dest');
      expect(mockFs.ensureDirSync).toHaveBeenCalled();
      expect(mockFs.copySync).toHaveBeenCalledWith('src', 'dest', undefined);
    });

    it('should throw on copy failure', () => {
      mockFs.copySync.mockImplementation(() => {
        throw new Error('fail');
      });
      expect(() => service.copy('src', 'dest')).toThrow(SystemError);
    });
  });

  describe('ensureDir/exists/isDirectory', () => {
    it('should ensure dir', () => {
      service.ensureDir('dir');
      expect(mockFs.ensureDirSync).toHaveBeenCalledWith('dir');
    });

    it('should throw SystemError on ensureDir failure', () => {
      mockFs.ensureDirSync.mockImplementation(() => {
        throw new Error('fail');
      });
      expect(() => service.ensureDir('dir')).toThrow(SystemError);
      expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Error ensuring directory'));
    });

    it('should check exists', () => {
      mockFs.existsSync.mockReturnValue(true);
      expect(service.exists('file')).toBe(true);
    });

    it('should check isDirectory', () => {
      mockFs.statSync.mockReturnValue({ isDirectory: () => true });
      expect(service.isDirectory('dir')).toBe(true);
    });

    it('should return false if stat fails', () => {
      mockFs.statSync.mockImplementation(() => {
        throw new Error('noent');
      });
      expect(service.isDirectory('dir')).toBe(false);
    });
  });

  describe('listFiles', () => {
    it('should return files', () => {
      mockFs.readdirSync.mockReturnValue(['a', 'b']);
      expect(service.listFiles('dir')).toEqual(['a', 'b']);
    });

    it('should return empty array and warn on failure', () => {
      mockFs.readdirSync.mockImplementation(() => {
        throw new Error('fail');
      });
      expect(service.listFiles('dir')).toEqual([]);
      expect(mockHost.log).toHaveBeenCalledWith('warn', expect.anything());
    });
  });

  describe('writeFileAtomic', () => {
    it('should write to temp and rename', () => {
      // Explicitly ensure success returns
      mockFs.writeFileSync.mockReturnValue(undefined);
      mockFs.renameSync.mockReturnValue(undefined);

      service.writeFileAtomic('file', 'content');

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining('file.tmp'), 'content', 'utf-8');
      expect(mockFs.renameSync).toHaveBeenCalledWith(expect.stringContaining('file.tmp'), 'file');
    });

    it('should cleanup temp file on error', () => {
      mockFs.renameSync.mockImplementation(() => {
        throw new Error('fail');
      });
      mockFs.existsSync.mockReturnValue(true); // Temp file exists

      expect(() => service.writeFileAtomic('file', 'content')).toThrow(SystemError);
      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });

    it('should handle atomic write failure with no temp file', () => {
      mockFs.renameSync.mockImplementation(() => {
        throw new Error('fail');
      });
      mockFs.existsSync.mockReturnValue(false); // Temp file missing

      expect(() => service.writeFileAtomic('file', 'content')).toThrow(SystemError);
      expect(mockFs.unlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('deleteFile', () => {
    it('should delete existing file', () => {
      mockFs.existsSync.mockReturnValue(true);
      service.deleteFile('file');
      expect(mockFs.unlinkSync).toHaveBeenCalledWith('file');
    });

    it('should do nothing if file missing', () => {
      mockFs.existsSync.mockReturnValue(false);
      service.deleteFile('file');
      expect(mockFs.unlinkSync).not.toHaveBeenCalled();
    });

    it('should throw on delete failure', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.unlinkSync.mockImplementation(() => {
        throw new Error('fail');
      });
      expect(() => service.deleteFile('file')).toThrow(SystemError);
    });
  });

  describe('locking', () => {
    it('should acquire and release lock', async () => {
      // Mock success on first try
      (mockFs.openSync as jest.Mock).mockReturnValue(123);
      mockFs.existsSync.mockReturnValue(true);

      const unlock = await service.acquireLock('file');

      expect(mockFs.openSync).toHaveBeenCalledWith('file.lock', 'wx');
      expect(mockFs.closeSync).toHaveBeenCalled();
      expect(typeof unlock).toBe('function');

      unlock();
      expect(mockFs.unlinkSync).toHaveBeenCalledWith('file.lock');
    });

    it('should retry acquiring lock', async () => {
      (mockFs.openSync as jest.Mock)
        .mockImplementationOnce(() => {
          throw new Error('exists');
        })
        .mockReturnValue(123);

      const unlock = await service.acquireLock('file', 3, 10);
      expect(mockFs.openSync).toHaveBeenCalledTimes(2);
      expect(typeof unlock).toBe('function');
    });

    it('should throw after max retries', async () => {
      (mockFs.openSync as jest.Mock).mockImplementation(() => {
        throw new Error('exists');
      });
      await expect(service.acquireLock('file', 2, 10)).rejects.toThrow(/after 2 attempts/);
    });

    it('should throw immediately if retries is 0', async () => {
      await expect(service.acquireLock('file', 0)).rejects.toThrow('Could not acquire lock for file');
    });

    it('should release existing lock', () => {
      mockFs.existsSync.mockReturnValue(true);
      service.releaseLock('file');
      expect(mockFs.unlinkSync).toHaveBeenCalledWith('file.lock');
    });

    it('should log error if release fails', () => {
      (mockFs.openSync as jest.Mock).mockReturnValue(123);
      mockFs.existsSync.mockReturnValue(true);
      mockFs.unlinkSync.mockImplementation(() => {
        throw new Error('fail');
      });

      service.releaseLock('file');
      expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Error releasing lock'));
    });

    it('should do nothing if release called on non-existent lock', () => {
      mockFs.existsSync.mockReturnValue(false);
      service.releaseLock('file');
      expect(mockFs.unlinkSync).not.toHaveBeenCalled();
    });
  });
});
