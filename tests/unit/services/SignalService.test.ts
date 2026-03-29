import { jest } from '@jest/globals';

import { FileSystemService } from '../../../src/services/FileSystemService.js';
import { SignalService } from '../../../src/services/SignalService.js';
import { ISignalJSON, Signal, SignalType } from '../../../src/workflow/Signal.js';

describe('SignalService', () => {
  let mockFs: jest.Mocked<FileSystemService>;
  let service: SignalService;

  beforeEach(() => {
    mockFs = {
      isDirectory: jest.fn(),
      listFiles: jest.fn(),
      readFile: jest.fn(),
      exists: jest.fn(),
      writeFile: jest.fn(),
      deleteFile: jest.fn(),
    } as unknown as jest.Mocked<FileSystemService>;
    service = new SignalService(mockFs);
    jest.clearAllMocks();
  });

  describe('getHighestPrioritySignal', () => {
    const signalsDir = '/tmp/signals';

    it('should return null if directory does not exist', async () => {
      mockFs.isDirectory.mockReturnValue(false);
      const result = await service.getHighestPrioritySignal(signalsDir);
      expect(result).toBeNull();
    });

    it('should return null if no JSON files exist', async () => {
      mockFs.isDirectory.mockReturnValue(true);
      mockFs.listFiles.mockReturnValue(['ignore.txt']);
      const result = await service.getHighestPrioritySignal(signalsDir);
      expect(result).toBeNull();
    });

    it('should parse and return the single signal', async () => {
      mockFs.isDirectory.mockReturnValue(true);
      mockFs.listFiles.mockReturnValue(['sig1.json']);
      mockFs.readFile.mockReturnValue(JSON.stringify({ status: 'COMPLETE', reason: 'done' }));

      const result = await service.getHighestPrioritySignal(signalsDir);
      expect(result).not.toBeNull();
      expect(result?.type).toBe(SignalType.COMPLETE);
    });

    it('should prioritize REARCHITECT over COMPLETE', async () => {
      mockFs.isDirectory.mockReturnValue(true);
      mockFs.listFiles.mockReturnValue(['sig_complete.json', 'sig_rearchitect.json']);

      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.endsWith('sig_complete.json')) {
          return JSON.stringify({ status: 'COMPLETE', reason: 'done' });
        }
        if (filePath.endsWith('sig_rearchitect.json')) {
          return JSON.stringify({ status: 'REARCHITECT', reason: 'major change' });
        }
        return '';
      });

      const result = await service.getHighestPrioritySignal(signalsDir);
      expect(result?.type).toBe(SignalType.REARCHITECT);
    });

    it('should log warning and continue on parse error', async () => {
      mockFs.isDirectory.mockReturnValue(true);
      mockFs.listFiles.mockReturnValue(['bad.json', 'good.json']);
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.endsWith('bad.json')) return 'invalid json';
        return JSON.stringify({ status: 'COMPLETE' });
      });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await service.getHighestPrioritySignal(signalsDir);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse signal file bad.json'),
        expect.any(Error),
      );
      expect(result?.type).toBe(SignalType.COMPLETE);
      consoleSpy.mockRestore();
    });

    it('should return null if all JSON files are invalid', async () => {
      mockFs.isDirectory.mockReturnValue(true);
      mockFs.listFiles.mockReturnValue(['bad1.json', 'bad2.json']);
      mockFs.readFile.mockImplementation(() => 'invalid json');

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await service.getHighestPrioritySignal(signalsDir);

      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });
  });

  describe('ensureNoInterrupt', () => {
    it('should throw SignalDetectedError if signal found', async () => {
      mockFs.isDirectory.mockReturnValue(true);
      mockFs.listFiles.mockReturnValue(['sig.json']);
      mockFs.readFile.mockReturnValue(
        JSON.stringify({ status: SignalType.FAIL, reason: 'error', metadata: {} } as ISignalJSON),
      );
      await expect(service.ensureNoInterrupt('/tmp/signals', 'task-1')).rejects.toThrow();
    });

    it('should resolve if no signal found', async () => {
      mockFs.isDirectory.mockReturnValue(false);
      await expect(service.ensureNoInterrupt('/tmp/signals')).resolves.toBeUndefined();
    });

    it('should not catch FS errors in ensureNoInterrupt (they propagate)', async () => {
      mockFs.isDirectory.mockReturnValue(true);
      mockFs.listFiles.mockImplementation(() => {
        throw new Error('critical fs error');
      });

      await expect(service.ensureNoInterrupt('/tmp/signals')).rejects.toThrow('critical fs error');
    });
  });

  describe('miscellaneous', () => {
    it('should write signal to file', async () => {
      const signal = new Signal(SignalType.COMPLETE, 'done');
      mockFs.exists.mockReturnValue(false);

      await service.writeSignal('/tmp/sig.json', signal);

      expect(mockFs.writeFile).toHaveBeenCalledWith('/tmp/sig.json', expect.stringContaining('"status": "COMPLETE"'));
    });

    it('should clear signals correctly', async () => {
      mockFs.isDirectory.mockReturnValue(true);
      mockFs.listFiles.mockReturnValue(['s1.json', 'not-sig.txt']);

      await service.clearSignals('/tmp/sigs');

      expect(mockFs.deleteFile).toHaveBeenCalledTimes(1);
      expect(mockFs.deleteFile).toHaveBeenCalledWith(expect.stringContaining('s1.json'));
    });

    it('should handle unknown signal types in priority sorting', async () => {
      mockFs.isDirectory.mockReturnValue(true);
      mockFs.listFiles.mockReturnValue(['sig1.json', 'sig2.json']);
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.endsWith('sig1.json')) return JSON.stringify({ status: 'UNKNOWN' });
        return JSON.stringify({ status: 'REARCHITECT' });
      });

      const result = await service.getHighestPrioritySignal('/tmp');
      expect(result?.type).toBe(SignalType.REARCHITECT);
    });

    it('should cover directory check in writeSignal', async () => {
      mockFs.exists.mockReturnValue(false); // directory does not exist
      const signal = new Signal(SignalType.COMPLETE, 'done');
      await service.writeSignal('/tmp/newdir/sig.json', signal);
      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });
});
