import { jest } from '@jest/globals';

// Standalone mock variables for js-yaml to avoid unbound-method errors
const mockLoad = jest.fn<(...args: unknown[]) => unknown>();
const mockDump = jest.fn<(...args: unknown[]) => unknown>();

jest.unstable_mockModule('js-yaml', () => ({
  load: mockLoad,
  dump: mockDump,
  default: { load: mockLoad, dump: mockDump },
}));

// EvolutionService and EvolutionEntrySchema are imported dynamically in beforeEach for mocking.
import { IFileSystem } from '../../../src/domain/IFileSystem.js';
import { IProject } from '../../../src/domain/Project.js';
import type { EvolutionService as EvolutionServiceClass } from '../../../src/services/EvolutionService.js';
import { Signal, SignalType } from '../../../src/workflow/Signal.js';

// Standalone mock variables for other dependencies
const mockExists = jest.fn<IFileSystem['exists']>();
const mockReadFile = jest.fn<IFileSystem['readFile']>();
const mockWriteFileAtomic = jest.fn<IFileSystem['writeFileAtomic']>();
const mockEnsureDir = jest.fn<IFileSystem['ensureDir']>();
const mockCopy = jest.fn<IFileSystem['copy']>();
const mockDeleteFile = jest.fn<IFileSystem['deleteFile']>();
const mockAcquireLock = jest.fn<IFileSystem['acquireLock']>();
const mockIsDirectory = jest.fn<IFileSystem['isDirectory']>();
const mockListFiles = jest.fn<IFileSystem['listFiles']>();

const mockGetConfig = jest.fn<IProject['getConfig']>();
const mockGetConstraints = jest.fn<IProject['getConstraints']>();

describe('EvolutionService', () => {
  let service: EvolutionServiceClass;
  let mockProject: jest.Mocked<IProject>;
  let mockFileSystem: jest.Mocked<IFileSystem>;

  beforeEach(async () => {
    const { EvolutionService } = await import('../../../src/services/EvolutionService.js');

    mockLoad.mockReset();
    mockDump.mockReset();
    mockExists.mockReset();
    mockReadFile.mockReset();
    mockWriteFileAtomic.mockReset();
    mockEnsureDir.mockReset();
    mockCopy.mockReset();
    mockDeleteFile.mockReset();
    mockAcquireLock.mockReset();
    mockIsDirectory.mockReset();
    mockListFiles.mockReset();
    mockGetConfig.mockReset();
    mockGetConstraints.mockReset();

    mockFileSystem = {
      exists: mockExists,
      readFile: mockReadFile,
      writeFileAtomic: mockWriteFileAtomic,
      ensureDir: mockEnsureDir,
      copy: mockCopy,
      deleteFile: mockDeleteFile,
      acquireLock: mockAcquireLock,
      isDirectory: mockIsDirectory,
      listFiles: mockListFiles,
    } as unknown as jest.Mocked<IFileSystem>;

    mockProject = {
      paths: {
        log: 'evolution.yml',
        architectureCurrent: '',
        planCurrent: '',
        archive: '',
        signals: '',
        state: '',
      },
      getConfig: mockGetConfig,
      getConstraints: mockGetConstraints,
      fileSystem: mockFileSystem,
    } as unknown as jest.Mocked<IProject>;

    service = new EvolutionService(mockProject, mockFileSystem);
  });

  it('should record failure', async () => {
    mockExists.mockReturnValue(false); // No existing log
    const signal = new Signal(SignalType.FAIL, 'error');

    await service.recordFailure('state', signal);

    expect(mockWriteFileAtomic).toHaveBeenCalled();
    const calls = mockWriteFileAtomic.mock.calls as [string, string][];
    expect(calls[0][0]).toBe('evolution.yml');
    expect(mockDump).toHaveBeenCalled();
  });

  it('should get log summary for multiple entries with and without feedback', () => {
    mockExists.mockReturnValue(true);
    mockReadFile.mockReturnValue('content');
    mockLoad.mockReturnValue([
      { timestamp: '1', state: 'S1', signal_type: 'T1', reason: 'R1', feedback: 'F1' },
      { timestamp: '2', state: 'S2', signal_type: 'T2', reason: 'R2' },
    ]);

    const summary = service.getLogSummary();
    expect(summary).toContain('S1');
    expect(summary).toContain('User Feedback: F1');
    expect(summary).toContain('S2');
    expect(summary).not.toContain('User Feedback: undefined');
  });

  it('should handle missing log for summary', () => {
    mockExists.mockReturnValue(false);
    const summary = service.getLogSummary();
    expect(summary).toBe('No historical failures recorded.');
  });

  it('should handle corrupted log file during recordFailure', async () => {
    mockExists.mockReturnValue(true);
    mockReadFile.mockReturnValue('invalid yaml content');
    mockLoad.mockReturnValue({ invalid: 'schema' }); // Returns object instead of array

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const signal = new Signal(SignalType.FAIL, 'error');
    await service.recordFailure('state', signal);

    expect(consoleSpy).toHaveBeenCalledWith('Evolution log corrupted or invalid:', expect.anything());
    expect(mockWriteFileAtomic).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should handle read error in recordFailure', async () => {
    mockExists.mockReturnValue(true);
    mockReadFile.mockImplementation(() => {
      throw new Error('Read failed');
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const signal = new Signal(SignalType.FAIL, 'error');
    await service.recordFailure('state', signal);

    expect(consoleSpy).toHaveBeenCalledWith('Failed to load evolution log:', expect.anything());
    expect(mockWriteFileAtomic).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should append to existing valid log', async () => {
    mockExists.mockReturnValue(true);
    mockReadFile.mockReturnValue('content');
    const existingLog = [{ timestamp: 'old', state: 'old', signal_type: 'old', reason: 'old' }];
    mockLoad.mockReturnValue(existingLog);

    const signal = new Signal(SignalType.FAIL, 'new');
    await service.recordFailure('new_state', signal);

    expect(mockWriteFileAtomic).toHaveBeenCalled();
    expect(mockDump).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ state: 'old' }),
        expect.objectContaining({ state: 'new_state' }),
      ]),
    );
  });

  it('should include feedback and tasks in failure record', async () => {
    mockExists.mockReturnValue(false);
    const signal = new Signal(SignalType.RETRY, 'retry me', { feedback: 'user feedback' });

    await service.recordFailure('state', signal, ['task1']);

    expect(mockDump).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          feedback: 'user feedback',
          tasks_at_failure: ['task1'],
        }),
      ]),
    );
  });

  it('should return correct summary for empty logs', () => {
    mockExists.mockReturnValue(true);
    mockReadFile.mockReturnValue('[]');
    mockLoad.mockReturnValue([]);

    const summary = service.getLogSummary();
    expect(summary).toBe('No historical failures recorded.');
  });

  it('should return error string if log schema is invalid in summary', () => {
    mockExists.mockReturnValue(true);
    mockReadFile.mockReturnValue('content');
    mockLoad.mockReturnValue([{ invalid: 'entry' }]);

    const summary = service.getLogSummary();
    expect(summary).toBe('Error reading evolution log (Invalid Schema).');
  });

  it('should return error string if read fails in summary', () => {
    mockExists.mockReturnValue(true);
    mockReadFile.mockImplementation(() => {
      throw new Error('Read failed');
    });

    const summary = service.getLogSummary();
    expect(summary).toBe('Error reading evolution log.');
  });
});
