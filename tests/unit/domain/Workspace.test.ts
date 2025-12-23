import { jest } from '@jest/globals';
// Define mocks first
const mockLoad = jest.fn();
const mockDump = jest.fn();

jest.unstable_mockModule('js-yaml', () => ({
  load: mockLoad,
  dump: mockDump,
  default: { load: mockLoad, dump: mockDump },
}));

// Dynamic imports
const { Workspace } = await import('../../../src/domain/Workspace.js');
const { Architecture } = await import('../../../src/domain/Architecture.js');
const { Plan } = await import('../../../src/domain/Plan.js');
const { EngineState } = await import('../../../src/domain/State.js');
const { SignalType } = await import('../../../src/workflow/Signal.js');

import { IFileSystem } from '../../../src/domain/IFileSystem.js';
import { IProject } from '../../../src/domain/Project.js';

describe('Workspace', () => {
  let workspace: InstanceType<typeof Workspace>;
  let mockProject: jest.Mocked<IProject>;
  let mockFileSystem: jest.Mocked<IFileSystem>;

  beforeEach(() => {
    // Reset mocks
    mockLoad.mockReset();
    mockDump.mockReset();

    mockFileSystem = {
      exists: jest.fn(),
      readFile: jest.fn(),
      writeFile: jest.fn(),
      appendFile: jest.fn(),
      move: jest.fn(),
      copy: jest.fn(),
      ensureDir: jest.fn(),
      isDirectory: jest.fn(),
      listFiles: jest.fn(),
      writeFileAtomic: jest.fn(),
      deleteFile: jest.fn(),
      acquireLock: jest.fn<IFileSystem['acquireLock']>().mockResolvedValue(() => {}),
      releaseLock: jest.fn(),
    } as unknown as jest.Mocked<IFileSystem>;

    mockProject = {
      fileSystem: mockFileSystem,
      paths: {
        architectureCurrent: 'arch_current',
        planCurrent: 'plan_current',
        archive: 'archive_dir',
        signals: 'signals_dir',
        state: 'state.yml',
      },
      getConfig: jest.fn(),
      getConstraints: jest.fn(),
    } as unknown as jest.Mocked<IProject>;

    workspace = new Workspace(mockProject);
  });

  it('should be defined', () => {
    expect(workspace).toBeDefined();
  });

  describe('getArchitecture', () => {
    it('should return cached architecture if available', async () => {
      mockFileSystem.exists.mockReturnValue(true);
      mockFileSystem.readFile.mockReturnValue('content');

      const first = await workspace.getArchitecture('current');
      const second = await workspace.getArchitecture('current');

      expect(mockFileSystem.readFile).toHaveBeenCalledTimes(1);
      expect(first).toEqual(second);
    });

    it('should read from disk if not cached', async () => {
      mockFileSystem.exists.mockReturnValue(true);
      mockFileSystem.readFile.mockReturnValue('content');
      const arch = await workspace.getArchitecture('current');
      expect(arch).toBeDefined();
    });

    it('should return empty architecture if file not exists', async () => {
      mockFileSystem.exists.mockReturnValue(false);
      const arch = await workspace.getArchitecture('current');
      expect(arch).toBeDefined();
    });
  });

  describe('saveArchitecture', () => {
    it('should write to file', async () => {
      const arch = new Architecture({ overview: '', fileStructure: '', components: '', details: '' }, 'content');
      await workspace.saveArchitecture(arch);
      expect(mockFileSystem.writeFileAtomic).toHaveBeenCalledWith('arch_current', 'content');
    });
  });

  describe('savePlan', () => {
    it('should save plan to disk', async () => {
      mockDump.mockReturnValue('plan_name: test plan');
      const plan = new Plan('test plan', []);
      await workspace.savePlan(plan);
      expect(mockFileSystem.writeFileAtomic).toHaveBeenCalledWith(
        'plan_current',
        expect.stringContaining('plan_name: test plan'),
      );
    });
  });

  describe('loadPlan', () => {
    it('should load plan from disk', async () => {
      mockFileSystem.exists.mockReturnValue(true);
      mockFileSystem.readFile.mockReturnValue('plan content');
      mockLoad.mockReturnValue({ plan_name: 'test', tasks: [] });

      const plan = await workspace.loadPlan();
      expect(plan).toBeInstanceOf(Plan);
    });

    it('should return cached plan if available', async () => {
      mockFileSystem.exists.mockReturnValue(true);
      mockFileSystem.readFile.mockReturnValue('plan content');
      mockLoad.mockReturnValue({ plan_name: 'test', tasks: [] });

      const first = await workspace.loadPlan();
      const second = await workspace.loadPlan();

      expect(mockFileSystem.readFile).toHaveBeenCalledTimes(1);
      expect(first).toBe(second);
    });

    it('should return new plan if file does not exist', async () => {
      mockFileSystem.exists.mockReturnValue(false);
      const plan = await workspace.loadPlan();
      expect(plan).toBeInstanceOf(Plan);
      expect(plan.plan_name).toBe('New Plan');
    });
  });

  describe('archiveArtifacts', () => {
    it('should copy artifacts to archive if they exist', () => {
      mockFileSystem.exists.mockReturnValue(true);
      workspace.archiveArtifacts();
      expect(mockFileSystem.copy).toHaveBeenCalledTimes(2);
    });

    it('should skip copying if artifacts do not exist', () => {
      mockFileSystem.exists.mockReturnValue(false);
      workspace.archiveArtifacts();
      expect(mockFileSystem.copy).not.toHaveBeenCalled();
    });
  });

  describe('detectSignal', () => {
    it('should detect valid signal', async () => {
      mockFileSystem.isDirectory.mockReturnValue(true);
      mockFileSystem.listFiles.mockReturnValue(['test.signal.yml']);
      mockFileSystem.readFile.mockReturnValue('content');
      mockLoad.mockReturnValue({ type: 'FAIL', reason: 'user request' });

      const signal = await workspace.detectSignal();
      expect(signal).toBeDefined();
      expect(signal?.type).toBe(SignalType.FAIL);
    });

    it('should detect valid signal with .yaml extension', async () => {
      mockFileSystem.isDirectory.mockReturnValue(true);
      mockFileSystem.listFiles.mockReturnValue(['test.signal.yaml']);
      mockFileSystem.readFile.mockReturnValue('content');
      mockLoad.mockReturnValue({ type: 'NEXT', reason: 'ok' });

      const signal = await workspace.detectSignal();
      expect(signal).toBeDefined();
      expect(signal?.type).toBe(SignalType.NEXT);
    });

    it('should skip files with other extensions', async () => {
      mockFileSystem.isDirectory.mockReturnValue(true);
      mockFileSystem.listFiles.mockReturnValue(['not-a-signal.txt', 'test.signal.yml']);
      mockFileSystem.readFile.mockReturnValue('content');
      mockLoad.mockReturnValue({ type: 'NEXT', reason: 'ok' });

      const signal = await workspace.detectSignal();
      expect(signal).toBeDefined();
      expect(mockFileSystem.readFile).toHaveBeenCalledTimes(1); // Only read the yml one
    });

    it('should return null if no signals', async () => {
      mockFileSystem.isDirectory.mockReturnValue(true);
      mockFileSystem.listFiles.mockReturnValue([]);
      const signal = await workspace.detectSignal();
      expect(signal).toBeNull();
    });

    it('should return null if signals dir is not a directory', async () => {
      mockFileSystem.isDirectory.mockReturnValue(false);
      const signal = await workspace.detectSignal();
      expect(signal).toBeNull();
    });

    it('should warn and skip invalid signal file', async () => {
      mockFileSystem.isDirectory.mockReturnValue(true);
      mockFileSystem.listFiles.mockReturnValue(['invalid.signal.yml']);
      mockFileSystem.readFile.mockReturnValue('content');
      mockLoad.mockReturnValue({}); // Missing type and reason

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const signal = await workspace.detectSignal();

      expect(signal).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid signal file content'));
      consoleSpy.mockRestore();
    });

    it('should handle parse error in signal file', async () => {
      mockFileSystem.isDirectory.mockReturnValue(true);
      mockFileSystem.listFiles.mockReturnValue(['bad.signal.yml']);
      mockFileSystem.readFile.mockReturnValue('content');
      mockLoad.mockImplementation(() => {
        throw new Error('Parse error');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const signal = await workspace.detectSignal();

      expect(signal).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse signal file'),
        expect.anything(),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('clearSignals', () => {
    it('should delete all files in signals directory', async () => {
      mockFileSystem.isDirectory.mockReturnValue(true);
      mockFileSystem.listFiles.mockReturnValue(['s1.yml', 's2.yml']);

      await workspace.clearSignals();

      expect(mockFileSystem.deleteFile).toHaveBeenCalledTimes(2);
    });

    it('should do nothing if signals dir is missing', async () => {
      mockFileSystem.isDirectory.mockReturnValue(false);
      await workspace.clearSignals();
      expect(mockFileSystem.deleteFile).not.toHaveBeenCalled();
    });
  });

  describe('state persistence', () => {
    it('should save state', async () => {
      const state = new EngineState('id');
      mockDump.mockReturnValue('yaml state');
      await workspace.saveState(state);
      expect(mockFileSystem.writeFileAtomic).toHaveBeenCalledWith('state.yml', 'yaml state');
    });

    it('should load state if exists', async () => {
      mockFileSystem.exists.mockReturnValue(true);
      mockLoad.mockReturnValue({ session_id: 'id', status: 'ready', tasks: [] });
      const state = await workspace.loadState();
      expect(state).toBeInstanceOf(EngineState);
    });

    it('should return undefined if state does not exist', async () => {
      mockFileSystem.exists.mockReturnValue(false);
      const state = await workspace.loadState();
      expect(state).toBeUndefined();
    });
  });

  describe('async write error handling', () => {
    it('should log error if write fails', async () => {
      mockFileSystem.writeFileAtomic.mockImplementation(() => {
        throw new Error('Write failed');
      });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await workspace.saveState(new EngineState('id'));

      // Wait for async promise (scheduleWrite)
      await workspace.flush();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Async write failed'), expect.anything());
      consoleSpy.mockRestore();
    });
  });
});
