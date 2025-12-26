import { jest } from '@jest/globals';
import { SignalService } from '../../../src/services/SignalService.js';
import { SignalType } from '../../../src/workflow/Signal.js';

// jest.mock('../../../src/services/FileSystemService.js'); // Not needed if manual mock

describe('SignalService', () => {
  let signalService: SignalService;
  let mockFs: {
    isDirectory: jest.Mock;
    listFiles: jest.Mock;
    readFile: jest.Mock;
    writeFile: jest.Mock;
    exists: jest.Mock; // Add exists as it is used in writeSignal
    deleteFile: jest.Mock; // used in clearSignals
    acquireLock: jest.Mock;
  };

  beforeEach(() => {
    // Manual mock
    mockFs = {
      isDirectory: jest.fn(),
      listFiles: jest.fn(),
      readFile: jest.fn(),
      writeFile: jest.fn(),
      exists: jest.fn(),
      deleteFile: jest.fn(),
      acquireLock: jest.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signalService = new SignalService(mockFs as any);
  });

  describe('getHighestPrioritySignal', () => {
    const signalsDir = '/tmp/signals';

    it('should return null if directory does not exist', async () => {
      mockFs.isDirectory.mockReturnValue(false);
      const result = await signalService.getHighestPrioritySignal(signalsDir);
      expect(result).toBeNull();
    });

    it('should return null if no JSON files exist', async () => {
      mockFs.isDirectory.mockReturnValue(true);
      mockFs.listFiles.mockReturnValue(['ignore.txt']);
      const result = await signalService.getHighestPrioritySignal(signalsDir);
      expect(result).toBeNull();
    });

    it('should parse and return the single signal', async () => {
      mockFs.isDirectory.mockReturnValue(true);
      mockFs.listFiles.mockReturnValue(['sig1.json']);
      mockFs.readFile.mockReturnValue(JSON.stringify({ status: 'COMPLETE', reason: 'done' }));

      const result = await signalService.getHighestPrioritySignal(signalsDir);
      expect(result).not.toBeNull();
      expect(result?.type).toBe(SignalType.COMPLETE);
    });

    it('should prioritize REARCHITECT over COMPLETE', async () => {
      mockFs.isDirectory.mockReturnValue(true);
      mockFs.listFiles.mockReturnValue(['sig_complete.json', 'sig_rearchitect.json']);

      mockFs.readFile.mockImplementation((filePath: unknown) => {
        const pathStr = filePath as string;
        if (pathStr.endsWith('sig_complete.json')) {
          return JSON.stringify({ status: 'COMPLETE', reason: 'done' });
        }
        if (pathStr.endsWith('sig_rearchitect.json')) {
          return JSON.stringify({ status: 'REARCHITECT', reason: 'major change' });
        }
        return '';
      });

      const result = await signalService.getHighestPrioritySignal(signalsDir);
      expect(result).not.toBeNull();
      expect(result?.type).toBe(SignalType.REARCHITECT);
    });

    it('should prioritize CLARIFICATION over FAIL', async () => {
      mockFs.isDirectory.mockReturnValue(true);
      mockFs.listFiles.mockReturnValue(['sig_fail.json', 'sig_clarif.json']);

      mockFs.readFile.mockImplementation((filePath: unknown) => {
        const pathStr = filePath as string;
        if (pathStr.endsWith('sig_fail.json')) {
          return JSON.stringify({ status: 'FAIL', reason: 'broken' });
        }
        if (pathStr.endsWith('sig_clarif.json')) {
          return JSON.stringify({ status: 'CLARIFICATION_NEEDED', reason: 'help' });
        }
        return '';
      });

      const result = await signalService.getHighestPrioritySignal(signalsDir);
      expect(result).not.toBeNull();
      expect(result?.type).toBe(SignalType.CLARIFICATION_NEEDED);
    });
  });
});
