import { jest } from '@jest/globals';

// Mock yaml
const mockLoad = jest.fn();
const mockDump = jest.fn();

jest.unstable_mockModule('js-yaml', () => ({
  load: mockLoad,
  dump: mockDump,
  default: { load: mockLoad, dump: mockDump },
}));

const { EvolutionService, EvolutionEntrySchema } = await import('../../../src/services/EvolutionService.js');
const { Signal, SignalType } = await import('../../../src/workflow/Signal.js');
const { Project } = await import('../../../src/domain/Project.js');
const { FileSystemService } = await import('../../../src/services/FileSystemService.js');

describe('EvolutionService', () => {
  let service: InstanceType<typeof EvolutionService>;
  let mockProject: any;
  let mockFileSystem: any;

  beforeEach(() => {
    mockLoad.mockReset();
    mockDump.mockReset();

    mockProject = {
      paths: { log: 'evolution.yml' },
    };

    mockFileSystem = {
      exists: jest.fn(),
      readFile: jest.fn(),
      writeFileAtomic: jest.fn(),
    };

    service = new EvolutionService(mockProject, mockFileSystem);
  });

  it('should record failure', async () => {
    mockFileSystem.exists.mockReturnValue(false); // No existing log
    const signal = new Signal(SignalType.FAIL, 'error');

    await service.recordFailure('state', signal);

    expect(mockFileSystem.writeFileAtomic).toHaveBeenCalled();
    const args = mockFileSystem.writeFileAtomic.mock.calls[0];
    expect(args[0]).toBe('evolution.yml');
    expect(mockDump).toHaveBeenCalled();
  });

  it('should get log summary for multiple entries with and without feedback', () => {
    mockFileSystem.exists.mockReturnValue(true);
    mockFileSystem.readFile.mockReturnValue('content');
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
    mockFileSystem.exists.mockReturnValue(false);
    const summary = service.getLogSummary();
    expect(summary).toBe('No historical failures recorded.');
  });
  it('should handle corrupted log file during recordFailure', async () => {
    mockFileSystem.exists.mockReturnValue(true);
    mockFileSystem.readFile.mockReturnValue('invalid yaml content');
    mockLoad.mockReturnValue({ invalid: 'schema' }); // Returns object instead of array

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const signal = new Signal(SignalType.FAIL, 'error');
    await service.recordFailure('state', signal);

    expect(consoleSpy).toHaveBeenCalledWith('Evolution log corrupted or invalid:', expect.anything());
    // Should still overwrite with new entry (or whatever the logic is)
    // Code says: if (result.success) logs = result.data; else log error.
    // Then logs.push(newEntry); write dump(logs).
    // Since logs was init to [], it will write [newEntry].
    expect(mockFileSystem.writeFileAtomic).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should handle read error in recordFailure', async () => {
    mockFileSystem.exists.mockReturnValue(true);
    mockFileSystem.readFile.mockImplementation(() => {
      throw new Error('Read failed');
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const signal = new Signal(SignalType.FAIL, 'error');
    await service.recordFailure('state', signal);

    expect(consoleSpy).toHaveBeenCalledWith('Failed to load evolution log:', expect.anything());
    // Should still proceed to write new entry
    expect(mockFileSystem.writeFileAtomic).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should append to existing valid log', async () => {
    mockFileSystem.exists.mockReturnValue(true);
    mockFileSystem.readFile.mockReturnValue('content');
    const existingLog = [{ timestamp: 'old', state: 'old', signal_type: 'old', reason: 'old' }];
    mockLoad.mockReturnValue(existingLog);

    const signal = new Signal(SignalType.FAIL, 'new');
    await service.recordFailure('new_state', signal);

    expect(mockFileSystem.writeFileAtomic).toHaveBeenCalled();
    expect(mockDump).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ state: 'old' }),
        expect.objectContaining({ state: 'new_state' }),
      ]),
    );
  });

  it('should include feedback and tasks in failure record', async () => {
    mockFileSystem.exists.mockReturnValue(false);
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
    mockFileSystem.exists.mockReturnValue(true);
    mockFileSystem.readFile.mockReturnValue('[]');
    mockLoad.mockReturnValue([]);

    const summary = service.getLogSummary();
    expect(summary).toBe('No historical failures recorded.');
  });

  it('should return error string if log schema is invalid in summary', () => {
    mockFileSystem.exists.mockReturnValue(true);
    mockFileSystem.readFile.mockReturnValue('content');
    mockLoad.mockReturnValue([{ invalid: 'entry' }]);

    const summary = service.getLogSummary();
    expect(summary).toBe('Error reading evolution log (Invalid Schema).');
  });

  it('should return error string if read fails in summary', () => {
    mockFileSystem.exists.mockReturnValue(true);
    mockFileSystem.readFile.mockImplementation(() => {
      throw new Error('Read failed');
    });

    const summary = service.getLogSummary();
    expect(summary).toBe('Error reading evolution log.');
  });
});
