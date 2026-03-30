import { jest } from '@jest/globals';

import type { PlannerAgent as PlannerAgentType } from '../../../src/agents/PlannerAgent.js';
import { Architecture } from '../../../src/domain/Architecture.js';
import { IFileSystem } from '../../../src/domain/IFileSystem.js';
import { Plan } from '../../../src/domain/Plan.js';
import { IProject, ProjectProfile } from '../../../src/domain/Project.js';
import { Result } from '../../../src/domain/Result.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { Skill } from '../../../src/domain/Skill.js';
import { ISkillContext } from '../../../src/domain/SkillConfig.js';
import { IWorkspace } from '../../../src/domain/Workspace.js';
import { DriverRegistry } from '../../../src/drivers/DriverRegistry.js';
import { IEvolutionService } from '../../../src/services/EvolutionService.js';
import { FileSystemBus } from '../../../src/services/FileSystemBus.js';
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
const { PlannerAgent } = await import('../../../src/agents/PlannerAgent.js');

describe('PlannerAgent', () => {
  let agent: PlannerAgentType;
  let mockProject: jest.Mocked<IProject>;
  let mockWorkspace: jest.Mocked<IWorkspace>;
  let mockSkillRegistry: jest.Mocked<ISkillRegistry>;
  let mockDriverRegistry: jest.Mocked<DriverRegistry>;
  let mockEvolution: jest.Mocked<IEvolutionService>;
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockBus: jest.Mocked<FileSystemBus>;
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
        planCurrent: 'plan_current',
        personas: 'personas_path',
      },
      getConfig: jest.fn<IProject['getConfig']>().mockResolvedValue({} as unknown as ProjectProfile),
      rootDirectory: '/root',
      fileSystem: {
        readFile: jest.fn<IFileSystem['readFile']>().mockResolvedValue('file content'),
        writeFile: jest.fn<IFileSystem['writeFile']>(),
        exists: jest.fn<IFileSystem['exists']>().mockResolvedValue(true),
      } as unknown as jest.Mocked<IFileSystem>,
    } as unknown as jest.Mocked<IProject>;

    mockWorkspace = {
      savePlan: jest.fn<IWorkspace['savePlan']>(),
      loadPlan: jest.fn<IWorkspace['loadPlan']>().mockResolvedValue(new Plan('Test Plan', [])),
      getArchitecture: jest.fn<IWorkspace['getArchitecture']>(),
      saveArchitecture: jest.fn<IWorkspace['saveArchitecture']>(),
      archiveArtifacts: jest.fn<IWorkspace['archiveArtifacts']>(),
      detectSignal: jest.fn<IWorkspace['detectSignal']>(),
      clearSignals: jest.fn<IWorkspace['clearSignals']>(),
      saveState: jest.fn<IWorkspace['saveState']>(),
      loadState: jest.fn<IWorkspace['loadState']>(),
      flush: jest.fn<IWorkspace['flush']>(),
    } as unknown as jest.Mocked<IWorkspace>;

    mockSkill = {
      name: 'planner',
      description: 'planner desc',
      execute: jest.fn<(ctx: ISkillContext) => Promise<Result<string, Error>>>(),
    };

    mockSkillRegistry = {
      getSkill: jest.fn<ISkillRegistry['getSkill']>().mockImplementation((name: string) => {
        if (name === 'planner') return mockSkill as unknown as Skill;
        return undefined;
      }),
      getSkills: jest.fn<ISkillRegistry['getSkills']>().mockReturnValue([]),
      init: jest.fn<ISkillRegistry['init']>(),
    } as unknown as jest.Mocked<ISkillRegistry>;

    mockDriverRegistry = {
      get: jest.fn<DriverRegistry['get']>(),
      register: jest.fn<DriverRegistry['register']>(),
    } as unknown as jest.Mocked<DriverRegistry>;

    mockEvolution = {
      retrieve: jest.fn<IEvolutionService['retrieve']>().mockResolvedValue('evolution'),
      recordEvent: jest.fn<IEvolutionService['recordEvent']>(),
    } as unknown as jest.Mocked<IEvolutionService>;

    mockBus = {
      sendRequest: jest.fn<FileSystemBus['sendRequest']>(),
      waitForResponse: jest.fn<FileSystemBus['waitForResponse']>(),
      watchInbox: jest.fn<FileSystemBus['watchInbox']>(),
      sendResponse: jest.fn<FileSystemBus['sendResponse']>(),
      stop: jest.fn<FileSystemBus['stop']>(),
    } as unknown as jest.Mocked<FileSystemBus>;

    mockPromptEngine = {
      render: jest.fn<IPromptEngine['render']>(),
      renderString: jest.fn<IPromptEngine['renderString']>(),
    } as unknown as jest.Mocked<IPromptEngine>;

    agent = new PlannerAgent(
      mockProject,
      mockWorkspace,
      mockSkillRegistry,
      mockDriverRegistry,
      mockEvolution,
      mockHost,
      mockBus,
      mockPromptEngine,
    );
  });

  it('should be defined', () => {
    expect(agent).toBeDefined();
  });

  describe('plan', () => {
    const mockArch = Architecture.fromMarkdown('arch');

    it('should generate a plan successfully', async () => {
      const planYaml = 'plan_name: Test Plan\ntasks: []';
      mockSkill.execute.mockResolvedValue(Result.ok(planYaml));

      const plan = await agent.plan(mockArch, 'user request');

      expect(plan).toBeDefined();
      expect(mockSkillRegistry.getSkill).toHaveBeenCalledWith('planner');
      expect(mockWorkspace.savePlan).toHaveBeenCalled();
    });

    it('should throw if skill fails', async () => {
      mockSkill.execute.mockResolvedValue(Result.fail(new Error('Skill failed')));

      mockSkill.execute.mockImplementation(async (context: ISkillContext): Promise<Result<string, Error>> => {
        context.validators = [
          (): Promise<Result<boolean, Error>> => Promise.resolve(Result.fail(new Error('Validation failed'))),
        ] as unknown as Array<() => Promise<Result<boolean, Error>>>;
        await Promise.resolve(); // satisfy require-await
        return Result.fail(new Error('Skill failed'));
      });
      await expect(agent.plan(mockArch, 'req')).rejects.toThrow('Skill failed');
    });

    it('should throw simple error if skill fails without explicit error', async () => {
      mockSkill.execute.mockResolvedValue(Result.fail(undefined as unknown as Error));
      await expect(agent.plan(mockArch, 'req')).rejects.toThrow('Skill execution failed');
    });

    it('should throw if skill is not found', async () => {
      mockSkillRegistry.getSkill.mockReturnValue(undefined);
      await expect(agent.plan(mockArch, 'req')).rejects.toThrow(/Skill 'planner' not found/);
    });

    it('should use clarificationHandler in plan', async () => {
      mockSkill.execute.mockImplementation(async (context: ISkillContext) => {
        if (context.clarificationHandler) {
          await context.clarificationHandler('Why?');
        }
        return Result.ok('plan_name: Test Plan\ntasks: []');
      });

      mockBus.waitForResponse.mockResolvedValue({
        id: 'msg2',
        source: 'architect',
        correlationId: 'test-uuid',
        payload: {
          answers: { 'Why?': 'Because' },
        },
      });

      await agent.plan(mockArch, 'Test');
      expect(mockBus.sendRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'test-uuid',
          payload: expect.objectContaining({
            reason: 'Clarification needed',
            metadata: expect.objectContaining({ questions: ['Why?'] }) as unknown,
          } as unknown as Record<string, unknown>) as unknown,
        } as unknown as Record<string, unknown>),
      );
    });

    it('should return empty string if clarification response is missing answer', async () => {
      mockSkill.execute.mockImplementation(async (context: ISkillContext) => {
        if (context.clarificationHandler) {
          await context.clarificationHandler('Why?');
        }
        return Result.ok('plan_name: Test Plan\ntasks: []');
      });

      mockBus.waitForResponse.mockResolvedValue({
        id: 'msg2',
        source: 'architect',
        correlationId: 'test-uuid',
        payload: {
          answers: {}, // Empty
        },
      });

      await agent.plan(mockArch, 'Test');
      expect(mockBus.sendRequest).toHaveBeenCalled();
    });

    it('should use commandRunner in plan', async () => {
      mockSkill.execute.mockImplementation(async (context: ISkillContext): Promise<Result<string, Error>> => {
        if (context.commandRunner) {
          await context.commandRunner('ls', ['-la']);
        }
        return Result.ok('plan_name: Test Plan\ntasks: []');
      });

      mockShellExecute.mockResolvedValue({ stdout: 'file1' });

      await agent.plan(mockArch, 'Test');
      expect(mockShellExecute).toHaveBeenCalledWith('ls', ['-la']);
    });
    it('should log and throw if YAML is invalid', async () => {
      mockSkill.execute.mockResolvedValue(Result.ok('!!!invalid yaml'));
      await expect(agent.plan(mockArch, 'req')).rejects.toThrow();
      expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Failed to parse plan YAML'));
    });
  });
});
