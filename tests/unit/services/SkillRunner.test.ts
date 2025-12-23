import { jest } from '@jest/globals';

import { IDriver } from '../../../src/domain/Driver.js';
import { IProject } from '../../../src/domain/Project.js';
import { Result } from '../../../src/domain/Result.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { Task } from '../../../src/domain/Task.js';
import { DriverRegistry } from '../../../src/drivers/DriverRegistry.js';
import { PromptEngine } from '../../../src/services/PromptEngine.js';
import { SkillRunner as SkillRunnerClass } from '../../../src/services/SkillRunner.js';

// Mock functions
// Mock functions
const mockRegistryGet = jest.fn<DriverRegistry['get']>();
const mockRegistryGetDefault = jest.fn<DriverRegistry['getDefault']>();
const mockPromptRender = jest.fn<PromptEngine['render']>();
const mockFsIsDirectory = jest.fn<IProject['fileSystem']['isDirectory']>();
const mockFsListFiles = jest.fn<IProject['fileSystem']['listFiles']>();
const mockFsReadFile = jest.fn<IProject['fileSystem']['readFile']>();
const mockFsExists = jest.fn<IProject['fileSystem']['exists']>();
const mockHostLog = jest.fn<IRuntimeHost['log']>();
const mockHostStatus = jest.fn<IRuntimeHost['status']>();
const mockHostAsk = jest.fn<IRuntimeHost['ask']>();
const mockHostEmit = jest.fn<IRuntimeHost['emit']>();
const mockDriverIsSupported = jest.fn<IDriver['isSupported']>();
const mockDriverValidateSkill = jest.fn<IDriver['validateSkill']>();
const mockDriverExecute = jest.fn<IDriver['execute']>();

// Mocks
const mockDriverRegistry = {
  get: mockRegistryGet,
  getDefault: mockRegistryGetDefault,
} as unknown as jest.Mocked<DriverRegistry>;

const mockPromptEngine = {
  render: mockPromptRender,
} as unknown as jest.Mocked<PromptEngine>;

const mockProject = {
  paths: {
    skills: '/skills',
    personas: '/personas',
    skillPrompt: 'skill_prompt.j2',
  },
  fileSystem: {
    isDirectory: mockFsIsDirectory,
    listFiles: mockFsListFiles,
    readFile: mockFsReadFile,
    exists: mockFsExists,
  },
} as unknown as jest.Mocked<IProject>;

const mockHost = {
  log: mockHostLog,
  status: mockHostStatus,
  ask: mockHostAsk,
  emit: mockHostEmit,
} as unknown as jest.Mocked<IRuntimeHost>;

const mockYaml = {
  load: jest.fn<() => unknown>(),
} as unknown as { load: jest.Mock };

const MockSkillSchema = {
  parse: jest.fn<() => unknown>(),
} as unknown as { parse: jest.Mock };

const mockDriver = {
  name: 'mock-driver',
  isSupported: mockDriverIsSupported,
  validateSkill: mockDriverValidateSkill,
  execute: mockDriverExecute,
} as unknown as jest.Mocked<IDriver>;

jest.unstable_mockModule('path', () => ({
  default: { join: (...args: string[]): string => args.join('/') },
}));

jest.unstable_mockModule('js-yaml', () => ({
  default: mockYaml,
}));

jest.unstable_mockModule('../../../src/domain/Driver.js', () => ({
  SkillSchema: MockSkillSchema,
}));

jest.unstable_mockModule('../../../src/drivers/DriverRegistry.js', () => ({
  DriverRegistry: jest.fn(),
}));

// SkillRunner is imported here, but we will re-import it in beforeEach to ensure fresh mocks
let SkillRunner: typeof import('../../../src/services/SkillRunner.js').SkillRunner;

describe('SkillRunner', () => {
  let runner: SkillRunnerClass;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Re-import SkillRunner to ensure it picks up any fresh mocks
    ({ SkillRunner } = await import('../../../src/services/SkillRunner.js'));

    // Default happy path setup
    mockFsIsDirectory.mockReturnValue(true);
    mockFsListFiles.mockReturnValue(['test.skill.yaml']);
    mockFsReadFile.mockReturnValue('yaml content');

    mockYaml.load.mockReturnValue({ name: 'test-skill', provider: 'mock-driver' });
    MockSkillSchema.parse.mockReturnValue({ name: 'test-skill', provider: 'mock-driver' });

    mockRegistryGet.mockReturnValue(mockDriver);
    mockRegistryGetDefault.mockReturnValue(mockDriver);
    mockDriverIsSupported.mockResolvedValue(true);
    mockDriverValidateSkill.mockResolvedValue(true);

    mockDriverExecute.mockResolvedValue(Result.ok('success'));

    runner = new SkillRunner(mockProject, mockDriverRegistry, mockPromptEngine, mockHost);
  });

  describe('init', () => {
    it('should load skills from yaml and yml', async () => {
      mockFsListFiles.mockReturnValue(['test.skill.yaml', 'other.skill.yml']);
      mockYaml.load
        .mockReturnValueOnce({ name: 'skill1', provider: 'mock-driver' })
        .mockReturnValueOnce({ name: 'skill2', provider: 'mock-driver' });
      MockSkillSchema.parse
        .mockReturnValueOnce({ name: 'skill1', provider: 'mock-driver' })
        .mockReturnValueOnce({ name: 'skill2', provider: 'mock-driver' });

      await runner.init();
      expect(mockFsListFiles).toHaveBeenCalledWith('/skills');
      expect(mockYaml.load).toHaveBeenCalledTimes(2);
      expect(runner.getSkills()).toHaveLength(2);
    });

    it('should skip non-skill files', async () => {
      mockFsListFiles.mockReturnValue(['test.txt', 'readme.md']);
      await runner.init();
      expect(mockYaml.load).not.toHaveBeenCalled();
      expect(runner.getSkills()).toHaveLength(0);
    });

    it('should skip if skills dir missing', async () => {
      mockFsIsDirectory.mockReturnValue(false);
      await runner.init();
      expect(mockFsListFiles).not.toHaveBeenCalled();
    });

    it('should handle skill loading errors', async () => {
      mockYaml.load.mockImplementation(() => {
        throw new Error('parse error');
      });
      await runner.init();
      expect(mockHostLog).toHaveBeenCalledWith('error', expect.stringContaining('Error loading skill profile'));
    });
  });

  describe('validateAvailableSkills', () => {
    beforeEach(async () => {
      await runner.init();
    });

    it('should validate successfully', async () => {
      await runner.validateAvailableSkills();
      expect(mockHostLog).toHaveBeenCalledWith('debug', expect.stringContaining('Validated 1 skills'));
    });

    it('should validate successfully with default driver', async () => {
      MockSkillSchema.parse.mockReturnValue({ name: 'no-provider-skill' });
      await runner.init();
      await runner.validateAvailableSkills();
      expect(mockRegistryGetDefault).toHaveBeenCalled();
    });

    it('should throw if any skill fails validation', async () => {
      mockDriverValidateSkill.mockResolvedValue(false);
      await expect(runner.validateAvailableSkills()).rejects.toThrow('Skill validation failed');
    });

    it('should fail if driver missing', async () => {
      mockRegistryGet.mockReturnValue(undefined);
      await expect(runner.validateAvailableSkills()).rejects.toThrow('Skill validation failed');
    });

    it('should fail if default driver missing for provider-less skill', async () => {
      MockSkillSchema.parse.mockReturnValue({ name: 'test-skill' }); // no provider
      await runner.init(); // reload

      mockRegistryGetDefault.mockReturnValue(undefined);
      await expect(runner.validateAvailableSkills()).rejects.toThrow('needs a default driver but none is available.');
    });

    it('should handle skill validation when driver is not found', async () => {
      // This is hard to trigger because validateAvailableSkills usually throws earlier if driver is missing.
      // But if getDefault() returns undefined, it hits line 68.
      MockSkillSchema.parse.mockReturnValue({ name: 'skill-no-driver' });
      await runner.init();
      mockRegistryGetDefault.mockReturnValue(undefined);
      await expect(runner.validateAvailableSkills()).rejects.toThrow('needs a default driver');
    });

    it('should fail if driver not supported', async () => {
      mockDriverIsSupported.mockResolvedValue(false);
      await expect(runner.validateAvailableSkills()).rejects.toThrow('Skill validation failed');
    });

    it('should handle driver errors during validation', async () => {
      mockDriverValidateSkill.mockImplementation(() => {
        throw new Error('validation crash');
      });
      await expect(runner.validateAvailableSkills()).rejects.toThrow('validation crash');
    });
  });

  describe('runSkill', () => {
    beforeEach(async () => {
      await runner.init();
      mockPromptRender.mockReturnValue('rendered prompt');
    });

    it('should run skill successfully', async () => {
      const task = { id: '1', skill: 'test-skill', description: 'desc', params: {} } as unknown as Task;
      await runner.runSkill(task, 'prompt');
      expect(mockDriverExecute).toHaveBeenCalled();
    });

    it('should fail if skill not found', async () => {
      const task = { skill: 'unknown' } as unknown as Task;
      await expect(runner.runSkill(task, 'prompt')).rejects.toThrow('not found');
    });

    it('should load persona if present', async () => {
      mockFsExists.mockReturnValue(true);
      mockFsReadFile.mockReturnValue('persona content');

      const task = { skill: 'test-skill', persona: 'coder' } as unknown as Task;
      await runner.runSkill(task, 'prompt');

      expect(mockFsReadFile).toHaveBeenCalledWith('/personas/coder.md');
      expect(mockPromptRender).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ persona_context: 'persona content' }),
      );
    });

    it('should warn if persona missing', async () => {
      mockProject.fileSystem.exists.mockReturnValue(false);

      const task = { skill: 'test-skill', persona: 'coder' } as unknown as Task;
      await runner.runSkill(task, 'prompt');

      expect(mockHostLog).toHaveBeenCalledWith('warn', expect.stringContaining('Persona file not found'));
    });

    it('should use default driver if none specified', async () => {
      MockSkillSchema.parse.mockReturnValue({ name: 'test-skill' });
      await runner.init();
      const task = { skill: 'test-skill' } as unknown as Task;
      await runner.runSkill(task, 'prompt');
      expect(mockRegistryGetDefault).toHaveBeenCalled();
    });

    it('should throw if no driver found execution', async () => {
      mockRegistryGet.mockReturnValue(undefined);
      const task = { skill: 'test-skill' } as unknown as Task;
      await expect(runner.runSkill(task, 'prompt')).rejects.toThrow(/Driver '.*' not found/);
    });

    it('should throw if no default driver found during execution', async () => {
      MockSkillSchema.parse.mockReturnValue({ name: 'test-skill' }); // no provider
      await runner.init();

      mockRegistryGetDefault.mockReturnValue(undefined);
      const task = { skill: 'test-skill' } as unknown as Task;
      await expect(runner.runSkill(task, 'prompt')).rejects.toThrow('No driver found for execution.');
    });

    it('should throw if driver execute returns failure', async () => {
      mockDriverExecute.mockReturnValue(Promise.resolve(Result.fail(new Error('execution failed'))));
      const task = { skill: 'test-skill' } as unknown as Task;
      await expect(runner.runSkill(task, 'prompt')).rejects.toThrow('execution failed');
    });

    it('should throw "Unknown error" if driver execute returns failure without error', async () => {
      mockDriverExecute.mockResolvedValue(Result.fail<string, unknown>(null) as unknown as Result<string, Error>);
      const task = { skill: 'test-skill' } as unknown as Task;
      await expect(runner.runSkill(task, 'prompt')).rejects.toThrow('Unknown error during skill execution');
    });
  });
});
