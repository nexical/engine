import { jest } from '@jest/globals';

import { IFileSystem } from '../../../src/domain/IFileSystem.js';
import { Project } from '../../../src/domain/Project.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';

describe('Project', () => {
  let project: Project;
  let mockFileSystem: jest.Mocked<IFileSystem>;
  let mockHost: jest.Mocked<IRuntimeHost>;
  const rootDir = '/test/root';

  beforeEach(() => {
    mockFileSystem = {
      exists: jest.fn<IFileSystem['exists']>().mockResolvedValue(false),
      readFile: jest.fn<IFileSystem['readFile']>().mockResolvedValue(''),
      ensureDir: jest.fn<IFileSystem['ensureDir']>().mockResolvedValue(undefined),
      writeFile: jest.fn<IFileSystem['writeFile']>().mockResolvedValue(undefined),
      deleteFile: jest.fn<IFileSystem['deleteFile']>().mockResolvedValue(undefined),
      listFiles: jest.fn<IFileSystem['listFiles']>().mockResolvedValue([]),
      isDirectory: jest.fn<IFileSystem['isDirectory']>().mockResolvedValue(false),
      move: jest.fn<IFileSystem['move']>().mockResolvedValue(undefined),
      copy: jest.fn<IFileSystem['copy']>().mockResolvedValue(undefined),
      appendFile: jest.fn<IFileSystem['appendFile']>().mockResolvedValue(undefined),
      writeFileAtomic: jest.fn<IFileSystem['writeFileAtomic']>().mockResolvedValue(undefined),
      acquireLock: jest.fn<IFileSystem['acquireLock']>().mockResolvedValue((): Promise<void> => {
        return Promise.resolve();
      }),
      releaseLock: jest.fn<IFileSystem['releaseLock']>().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IFileSystem>;

    mockHost = {
      log: jest.fn(),
      emit: jest.fn(),
      status: jest.fn(),
      ask: jest.fn(),
    } as unknown as jest.Mocked<IRuntimeHost>;

    project = new Project(rootDir, mockFileSystem, mockHost);
  });

  it('should be defined', () => {
    expect(project).toBeDefined();
  });

  it('should ensure directory structure on initialization', async () => {
    await project.init();
    expect(mockFileSystem.ensureDir).toHaveBeenCalledTimes(14); // count of ensureDir calls in ensureStructure
  });

  describe('getConstraints', () => {
    it('should return constraints from file if exists', async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue('constraints content');
      expect(await project.getConstraints()).toBe('constraints content');
    });

    it('should return default message if no constraints file', async () => {
      mockFileSystem.exists.mockResolvedValue(false);
      expect(await project.getConstraints()).toContain('No global constraints');
    });
  });

  describe('getConfig', () => {
    it('should return empty config if file does not exist', async () => {
      mockFileSystem.exists.mockResolvedValue(false);
      expect(await project.getConfig()).toEqual({ max_worktrees: 5 });
    });

    it('should return parsed config if file exists', async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue('agents:\n  architect:\n    skill: arch_skill\n');
      const config = await project.getConfig();
      expect(config.agents?.architect?.skill).toBe('arch_skill');
    });

    it('should return cached config on subsequent calls', async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue('agents: {}');

      const c1 = await project.getConfig();
      const c2 = await project.getConfig();

      expect(c1).toBe(c2);
      expect(mockFileSystem.readFile).toHaveBeenCalledTimes(1);
    });

    it('should log error and throw if loading fails', async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockRejectedValue(new Error('Read failed'));

      await expect(project.getConfig()).rejects.toThrow('Read failed');
      expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Failed to load project profile'));
    });
  });
});
