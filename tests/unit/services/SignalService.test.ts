import { jest } from '@jest/globals';

import { IFileSystem } from '../../../src/domain/IFileSystem.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { FileSystemService } from '../../../src/services/FileSystemService.js';
import { SignalService } from '../../../src/services/SignalService.js';
import { ISignalJSON, Signal, SignalType } from '../../../src/workflow/Signal.js';

describe('SignalService', () => {
  let mockFs: jest.Mocked<FileSystemService>;
  let mockHost: jest.Mocked<IRuntimeHost>;
  let service: SignalService;

  beforeEach(() => {
    mockFs = {
      isDirectory: jest.fn<IFileSystem['isDirectory']>(),
      listFiles: jest.fn<IFileSystem['listFiles']>(),
      readFile: jest.fn<IFileSystem['readFile']>(),
      exists: jest.fn<IFileSystem['exists']>(),
      writeFile: jest.fn<IFileSystem['writeFile']>(),
      deleteFile: jest.fn<IFileSystem['deleteFile']>(),
    } as unknown as jest.Mocked<FileSystemService>;

    mockHost = {
      log: jest.fn(),
      emit: jest.fn(),
      status: jest.fn(),
      ask: jest.fn(),
    } as unknown as jest.Mocked<IRuntimeHost>;

    service = new SignalService(mockFs, mockHost);
    jest.clearAllMocks();
  });

  describe('getHighestPrioritySignal', () => {
    const signalsDir = '/tmp/signals';

    it('should return null if directory does not exist', async () => {
      mockFs.isDirectory.mockResolvedValue(false);
      const result = await service.getHighestPrioritySignal(signalsDir);
      expect(result).toBeNull();
    });

    it('should return null if no JSON files exist', async () => {
      mockFs.isDirectory.mockResolvedValue(true);
      mockFs.listFiles.mockResolvedValue(['ignore.txt']);
      const result = await service.getHighestPrioritySignal(signalsDir);
      expect(result).toBeNull();
    });

    it('should parse and return the single signal', async () => {
      mockFs.isDirectory.mockResolvedValue(true);
      mockFs.listFiles.mockResolvedValue(['sig1.json']);
      mockFs.readFile.mockResolvedValue(JSON.stringify({ status: 'COMPLETE', reason: 'done' }));

      const result = await service.getHighestPrioritySignal(signalsDir);
      expect(result).not.toBeNull();
      expect(result?.type).toBe(SignalType.COMPLETE);
    });

    it('should prioritize REARCHITECT over COMPLETE', async () => {
      mockFs.isDirectory.mockResolvedValue(true);
      mockFs.listFiles.mockResolvedValue(['sig_complete.json', 'sig_rearchitect.json']);

      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.endsWith('sig_complete.json')) {
          return Promise.resolve(JSON.stringify({ status: 'COMPLETE', reason: 'done' }));
        }
        if (filePath.endsWith('sig_rearchitect.json')) {
          return Promise.resolve(JSON.stringify({ status: 'REARCHITECT', reason: 'major change' }));
        }
        return Promise.resolve('');
      });

      const result = await service.getHighestPrioritySignal(signalsDir);
      expect(result?.type).toBe(SignalType.REARCHITECT);
    });

    it('should log warning and continue on parse error', async () => {
      mockFs.isDirectory.mockResolvedValue(true);
      mockFs.listFiles.mockResolvedValue(['bad.json', 'good.json']);
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.endsWith('bad.json')) return Promise.resolve('invalid json');
        return Promise.resolve(JSON.stringify({ status: 'COMPLETE' }));
      });

      const result = await service.getHighestPrioritySignal(signalsDir);

      expect(mockHost.log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('Failed to parse signal file bad.json'),
      );
      expect(result?.type).toBe(SignalType.COMPLETE);
    });

    it('should return null if all JSON files are invalid', async () => {
      mockFs.isDirectory.mockResolvedValue(true);
      mockFs.listFiles.mockResolvedValue(['bad1.json', 'bad2.json']);
      mockFs.readFile.mockImplementation(() => Promise.resolve('invalid json'));

      const result = await service.getHighestPrioritySignal(signalsDir);

      expect(result).toBeNull();
    });
  });

  describe('ensureNoInterrupt', () => {
    it('should throw SignalDetectedError if signal found', async () => {
      mockFs.isDirectory.mockResolvedValue(true);
      mockFs.listFiles.mockResolvedValue(['sig.json']);
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({ status: SignalType.FAIL, reason: 'error', metadata: {} } as ISignalJSON),
      );
      await expect(service.ensureNoInterrupt('/tmp/signals', 'task-1')).rejects.toThrow();
    });

    it('should resolve if no signal found', async () => {
      mockFs.isDirectory.mockResolvedValue(false);
      await expect(service.ensureNoInterrupt('/tmp/signals')).resolves.toBeUndefined();
    });

    it('should not catch FS errors in ensureNoInterrupt (they propagate)', async () => {
      mockFs.isDirectory.mockResolvedValue(true);
      mockFs.listFiles.mockImplementation(() => {
        throw new Error('critical fs error');
      });

      await expect(service.ensureNoInterrupt('/tmp/signals')).rejects.toThrow('critical fs error');
    });
  });

  describe('miscellaneous', () => {
    it('should write signal to file', async () => {
      const signal = new Signal(SignalType.COMPLETE, 'done');
      mockFs.exists.mockResolvedValue(false);

      await service.writeSignal('/tmp/sig.json', signal);

      expect(mockFs.writeFile).toHaveBeenCalledWith('/tmp/sig.json', expect.stringContaining('"status": "COMPLETE"'));
    });

    it('should clear signals correctly', async () => {
      mockFs.isDirectory.mockResolvedValue(true);
      mockFs.listFiles.mockResolvedValue(['s1.json', 'not-sig.txt']);

      await service.clearSignals('/tmp/sigs');

      expect(mockFs.deleteFile).toHaveBeenCalledTimes(1);
      expect(mockFs.deleteFile).toHaveBeenCalledWith(expect.stringContaining('s1.json'));
    });

    it('should handle unknown signal types in priority sorting', async () => {
      mockFs.isDirectory.mockResolvedValue(true);
      mockFs.listFiles.mockResolvedValue(['sig1.json', 'sig2.json']);
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.endsWith('sig1.json')) return Promise.resolve(JSON.stringify({ status: 'UNKNOWN' }));
        return Promise.resolve(JSON.stringify({ status: 'REARCHITECT' }));
      });

      const result = await service.getHighestPrioritySignal('/tmp');
      expect(result?.type).toBe(SignalType.REARCHITECT);
    });

    it('should cover directory check in writeSignal', async () => {
      mockFs.exists.mockResolvedValue(false); // directory does not exist
      const signal = new Signal(SignalType.COMPLETE, 'done');
      await service.writeSignal('/tmp/newdir/sig.json', signal);
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should return early if directory does not exist in clearSignals', async () => {
      mockFs.isDirectory.mockResolvedValue(false);
      await service.clearSignals('/tmp/sigs');
      expect(mockFs.listFiles).not.toHaveBeenCalled();
    });

    it('should use default unknown taskId in ensureNoInterrupt', async () => {
      mockFs.isDirectory.mockResolvedValue(true);
      mockFs.listFiles.mockResolvedValue(['sig.json']);
      mockFs.readFile.mockResolvedValue(JSON.stringify({ status: 'FAIL' }));
      await expect(service.ensureNoInterrupt('/tmp/sigs')).rejects.toThrow();
    });

    it('should not log if host is missing during parse error', async () => {
      const s = new SignalService(mockFs);
      mockFs.isDirectory.mockResolvedValue(true);
      mockFs.listFiles.mockResolvedValue(['bad.json']);
      mockFs.readFile.mockResolvedValue('invalid json');
      const result = await s.getHighestPrioritySignal('/tmp');
      expect(result).toBeNull();
      expect(mockHost.log).not.toHaveBeenCalled();
    });
  });
});
