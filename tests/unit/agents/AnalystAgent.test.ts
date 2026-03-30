import { jest } from '@jest/globals';

import type { AnalystAgent as AnalystAgentType } from '../../../src/agents/AnalystAgent.js';
import { IFileSystem } from '../../../src/domain/IFileSystem.js';
import { IProject, ProjectProfile } from '../../../src/domain/Project.js';
import { Result } from '../../../src/domain/Result.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { Skill } from '../../../src/domain/Skill.js';
import { ISkillContext } from '../../../src/domain/SkillConfig.js';
import { DriverRegistry } from '../../../src/drivers/DriverRegistry.js';
import { IPromptEngine } from '../../../src/services/PromptEngine.js';
import { ISkillRegistry } from '../../../src/services/SkillRegistry.js';

// Mock ShellService
const mockShellExecute = jest.fn<(cmd: string, args: string[]) => Promise<{ stdout: string }>>();
const MockShellService = jest.fn(() => ({
  execute: mockShellExecute,
}));

jest.unstable_mockModule('../../../src/services/ShellService.js', () => ({
  ShellService: MockShellService,
}));

// Mock uuid
jest.unstable_mockModule('uuid', () => ({
  v4: (): string => 'test-uuid',
}));

// Dynamic import after mocks
const { AnalystAgent } = await import('../../../src/agents/AnalystAgent.js');

describe('AnalystAgent', () => {
  let agent: AnalystAgentType;
  let mockProject: jest.Mocked<IProject>;
  let mockSkillRegistry: jest.Mocked<ISkillRegistry>;
  let mockDriverRegistry: jest.Mocked<DriverRegistry>;
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockPromptEngine: jest.Mocked<IPromptEngine>;

  interface IMockSkill extends Partial<Skill> {
    name: string;
    description: string;
    execute: jest.Mock<(context: ISkillContext) => Promise<Result<string, Error>>>;
  }

  let mockSkill: IMockSkill;

  beforeEach(() => {
    jest.clearAllMocks();

    mockHost = {
      log: jest.fn<IRuntimeHost['log']>(),
      status: jest.fn<IRuntimeHost['status']>(),
      ask: jest.fn<IRuntimeHost['ask']>(),
      emit: jest.fn<IRuntimeHost['emit']>(),
    } as unknown as jest.Mocked<IRuntimeHost>;

    mockProject = {
      getConstraints: jest.fn<IProject['getConstraints']>().mockResolvedValue('constraints'),
      paths: {
        analysisPrompt: 'analysis_prompt',
        personas: 'personas_path',
        evolution: 'evolution_dir',
        evolutionIndex: 'index_file',
        evolutionTopics: 'topics_dir',
        log: '/root/.ai/log.jsonl',
      },
      getConfig: jest.fn<IProject['getConfig']>().mockResolvedValue({
        max_worktrees: 1,
      } as unknown as ProjectProfile),
      rootDirectory: '/root',
      fileSystem: {
        exists: jest.fn<IFileSystem['exists']>().mockResolvedValue(true),
        readFile: jest.fn<IFileSystem['readFile']>().mockResolvedValue('log content'),
        deleteFile: jest.fn<IFileSystem['deleteFile']>().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<IFileSystem>,
    } as unknown as jest.Mocked<IProject>;

    mockSkill = {
      name: 'analyst',
      description: 'analyst description',
      execute: jest.fn<(ctx: ISkillContext) => Promise<Result<string, Error>>>(),
    };

    mockSkillRegistry = {
      getSkill: jest.fn<ISkillRegistry['getSkill']>().mockReturnValue(mockSkill as unknown as Skill),
      getSkills: jest.fn<ISkillRegistry['getSkills']>().mockReturnValue([]),
      init: jest.fn<ISkillRegistry['init']>(),
    } as unknown as jest.Mocked<ISkillRegistry>;

    mockDriverRegistry = {
      get: jest.fn<DriverRegistry['get']>(),
      register: jest.fn<DriverRegistry['register']>(),
    } as unknown as jest.Mocked<DriverRegistry>;

    mockPromptEngine = {
      render: jest.fn<IPromptEngine['render']>(),
      renderString: jest.fn<IPromptEngine['renderString']>(),
    } as unknown as jest.Mocked<IPromptEngine>;

    agent = new AnalystAgent(mockProject, mockSkillRegistry, mockDriverRegistry, mockHost, mockPromptEngine);
  });

  it('should be defined', () => {
    expect(agent).toBeDefined();
  });

  describe('analyze', () => {
    it('should execute analysis successfully', async () => {
      const validYaml = 'analysis: valid';
      mockSkill.execute.mockResolvedValue(Result.ok(validYaml));

      await agent.analyze();

      expect(mockSkillRegistry.getSkill).toHaveBeenCalledWith('analyst');
      expect(mockSkill.execute).toHaveBeenCalled();
      expect(mockProject.fileSystem.deleteFile).toHaveBeenCalled();
    });

    it('should throw if skill is not found', async () => {
      mockSkillRegistry.getSkill.mockReturnValue(undefined);
      await expect(agent.analyze()).rejects.toThrow(/Skill 'analyst' not found/);
    });

    it('should handle skill execution fail', async () => {
      mockSkill.execute.mockResolvedValue(Result.fail(new Error('Skill failed')));
      await agent.analyze();
      expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Analyst failed: Skill failed'));
    });

    it('should return early if log file is missing', async () => {
      mockProject.fileSystem.exists.mockResolvedValue(false);
      await agent.analyze();
      expect(mockHost.log).toHaveBeenCalledWith('info', expect.stringContaining('No evolution log found'));
    });

    it('should provide working context handlers', async () => {
      let capturedContext: ISkillContext | undefined;
      mockSkill.execute.mockImplementation((context: ISkillContext) => {
        capturedContext = context;
        return Promise.resolve(Result.ok('analysis: ok'));
      });

      await agent.analyze();
      if (!capturedContext) throw new Error('Context not captured');

      // Test clarificationHandler (always empty/warn for Analyst)
      const ans = await capturedContext.clarificationHandler('question?');
      expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Analyst asked for clarification'));
      expect(ans).toBe('');

      // Test commandRunner
      mockShellExecute.mockResolvedValue({ stdout: 'output' });
      const out = await capturedContext.commandRunner('echo', ['hello']);
      expect(mockShellExecute).toHaveBeenCalledWith('echo', ['hello']);
      expect(out).toBe('output');
    });

    it('should handle empty log content', async () => {
      mockProject.fileSystem.readFile.mockResolvedValue('   ');
      await agent.analyze();
      expect(mockHost.log).toHaveBeenCalledWith('info', expect.stringContaining('Evolution log is empty'));
    });

    it('should handle skill execution exceptions', async () => {
      mockSkill.execute.mockRejectedValue(new Error('Unexpected exception'));
      await agent.analyze();
      expect(mockHost.log).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Analyst execution exception: Unexpected exception'),
      );
    });

    it('should handle non-error skill execution exceptions', async () => {
      mockSkill.execute.mockRejectedValue('String exception');
      await agent.analyze();
      expect(mockHost.log).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Analyst execution exception: String exception'),
      );
    });
  });
});
