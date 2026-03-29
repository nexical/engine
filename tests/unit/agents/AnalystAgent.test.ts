/* eslint-disable */
import { jest } from '@jest/globals';
import { Result } from '../../../src/domain/Result.js';
import { IProject } from '../../../src/domain/Project.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { ISkillRegistry } from '../../../src/services/SkillRegistry.js';
import { DriverRegistry } from '../../../src/drivers/DriverRegistry.js';
import { IPromptEngine } from '../../../src/services/PromptEngine.js';
import { IFileSystem } from '../../../src/domain/IFileSystem.js';

// Mock ShellService
const mockShellExecute = jest.fn<(...args: any[]) => Promise<any>>();
const MockShellService = jest.fn(() => ({
  execute: mockShellExecute,
}));
jest.unstable_mockModule('../../../src/services/ShellService.js', () => ({
  ShellService: MockShellService,
}));

const { AnalystAgent } = await import('../../../src/agents/AnalystAgent.js');

describe('AnalystAgent', () => {
  let agent: any;
  let mockProject: jest.Mocked<IProject>;
  let mockSkillRegistry: jest.Mocked<ISkillRegistry>;
  let mockDriverRegistry: jest.Mocked<DriverRegistry>;
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockPromptEngine: jest.Mocked<IPromptEngine>;
  let mockFileSystem: jest.Mocked<IFileSystem>;
  let mockSkill: { execute: jest.Mock<any> };

  beforeEach(() => {
    jest.clearAllMocks();

    mockFileSystem = {
      writeFileAtomic: jest.fn(),
      exists: jest.fn(),
      readFile: jest.fn(),
      deleteFile: jest.fn(),
    } as unknown as jest.Mocked<IFileSystem>;

    mockProject = {
      rootDirectory: '/test',
      paths: {
        log: 'evolution.yml',
        evolution: 'evolution/',
        evolutionIndex: 'evolution/index.json',
        evolutionTopics: 'evolution/topics',
      },
      fileSystem: mockFileSystem,
      getConfig: jest.fn().mockReturnValue({}),
    } as unknown as jest.Mocked<IProject>;

    mockSkill = {
      execute: jest.fn(),
    };

    mockSkillRegistry = {
      getSkill: jest.fn().mockReturnValue(mockSkill),
    } as unknown as jest.Mocked<ISkillRegistry>;

    mockDriverRegistry = {} as unknown as jest.Mocked<DriverRegistry>;

    mockHost = {
      log: jest.fn(),
    } as unknown as jest.Mocked<IRuntimeHost>;

    mockPromptEngine = {
      renderString: jest.fn(),
    } as unknown as jest.Mocked<IPromptEngine>;

    mockFileSystem.exists.mockReturnValue(true);
    mockFileSystem.readFile.mockReturnValue('content');

    agent = new AnalystAgent(mockProject, mockSkillRegistry, mockDriverRegistry, mockHost, mockPromptEngine);
  });

  it('should be defined', () => {
    expect(agent).toBeDefined();
  });

  describe('analyze', () => {
    it('should execute analyst skill successfully and reset log', async () => {
      mockSkill.execute.mockResolvedValue(Result.ok('Analyzed and updated files.'));

      mockFileSystem.readFile.mockReturnValue('{}'); // Empty index for first read

      await agent.analyze();

      expect(mockSkillRegistry.getSkill).toHaveBeenCalledWith('analyst');
      expect(mockSkill.execute).toHaveBeenCalled();

      // Verify log reset
      expect(mockFileSystem.deleteFile).toHaveBeenCalledWith('evolution.yml');
      expect(mockHost.log).toHaveBeenCalledWith('info', expect.stringContaining('Analyst completed'));
    });

    it('should skip log reset if skill fails', async () => {
      mockSkill.execute.mockResolvedValue(Result.fail(new Error('Skill failed')));

      await agent.analyze();

      expect(mockSkill.execute).toHaveBeenCalled();
      expect(mockFileSystem.deleteFile).not.toHaveBeenCalled();
      expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Analyst failed'));
    });

    it('should throw if skill is missing', async () => {
      mockSkillRegistry.getSkill.mockReturnValue(undefined);

      await expect(agent.analyze()).rejects.toThrow("Skill 'analyst' not found");
    });

    it('should skip analysis if log file does not exist', async () => {
      mockFileSystem.exists.mockReturnValue(false);

      await agent.analyze();

      expect(mockHost.log).toHaveBeenCalledWith('info', 'Analyst: No evolution log found to analyze.');
      expect(mockSkillRegistry.getSkill).not.toHaveBeenCalled();
    });

    it('should skip analysis if log file is empty', async () => {
      mockFileSystem.exists.mockReturnValue(true);
      mockFileSystem.readFile.mockReturnValue('');

      await agent.analyze();

      expect(mockHost.log).toHaveBeenCalledWith('info', 'Analyst: Evolution log is empty.');
      expect(mockSkillRegistry.getSkill).not.toHaveBeenCalled();
    });

    it('should handle clarification request in context', async () => {
      mockSkill.execute.mockImplementation(async (context: any) => {
        await context.clarificationHandler('test question');
        return Result.ok('ok');
      });

      await agent.analyze();

      expect(mockHost.log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('Analyst asked for clarification: test question'),
      );
    });

    it('should handle command execution in context without args', async () => {
      mockShellExecute.mockResolvedValue({ stdout: 'shell output', stderr: '', exitCode: 0 });
      mockSkill.execute.mockImplementation(async (context: any) => {
        await context.commandRunner('ls');
        return Result.ok('ok');
      });

      await agent.analyze();

      expect(mockShellExecute).toHaveBeenCalledWith('ls', []);
    });

    it('should handle execution exception with Error object', async () => {
      mockSkill.execute.mockRejectedValue(new Error('Unexpected crash'));

      await agent.analyze();

      expect(mockHost.log).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Analyst execution exception: Unexpected crash'),
      );
    });

    it('should handle execution exception with non-Error object', async () => {
      mockSkill.execute.mockRejectedValue('Something went wrong');

      await agent.analyze();

      expect(mockHost.log).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Analyst execution exception: Something went wrong'),
      );
    });
  });
});
