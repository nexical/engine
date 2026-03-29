/* eslint-disable */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import { jest } from '@jest/globals';

import { Architecture } from '../../../src/domain/Architecture.js';
import { Plan } from '../../../src/domain/Plan.js';
import { IProject } from '../../../src/domain/Project.js';
import { Result } from '../../../src/domain/Result.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { ISkillContext } from '../../../src/domain/SkillConfig.js';
import { IWorkspace } from '../../../src/domain/Workspace.js';
import { DriverRegistry } from '../../../src/drivers/DriverRegistry.js';
import { IEvolutionService } from '../../../src/services/EvolutionService.js';
import { FileSystemBus } from '../../../src/services/FileSystemBus.js';
import { IPromptEngine } from '../../../src/services/PromptEngine.js';
import { ISkillRegistry } from '../../../src/services/SkillRegistry.js';
import { SignalType } from '../../../src/workflow/Signal.js';

// Mock ShellService
const mockShellExecute = jest.fn();
const MockShellService = jest.fn(() => ({
  execute: mockShellExecute,
}));

jest.unstable_mockModule('../../../src/services/ShellService.js', () => ({
  ShellService: MockShellService,
}));

// Mock uuid
jest.unstable_mockModule('uuid', () => ({
  v4: () => 'test-uuid',
}));

const { PlannerAgent } = await import('../../../src/agents/PlannerAgent.js');

describe('PlannerAgent', () => {
  let agent: any;
  let mockProject: jest.Mocked<IProject>;
  let mockWorkspace: jest.Mocked<IWorkspace>;
  let mockSkillRegistry: jest.Mocked<ISkillRegistry>;
  let mockDriverRegistry: jest.Mocked<DriverRegistry>;
  let mockEvolution: jest.Mocked<IEvolutionService>;
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockBus: jest.Mocked<FileSystemBus>;
  let mockPromptEngine: jest.Mocked<IPromptEngine>;
  let mockSkill: { execute: jest.Mock<(...args: any[]) => Promise<Result<string, Error>>> };

  beforeEach(() => {
    jest.clearAllMocks();

    mockHost = {
      log: jest.fn(),
      ask: jest.fn(),
    } as unknown as jest.Mocked<IRuntimeHost>;

    mockProject = {
      getConstraints: jest.fn().mockReturnValue('constraints'),
      paths: {
        plannerPrompt: 'planner_prompt',
        planCurrent: 'plan_current',
        personas: 'personas_path',
      },
      getConfig: jest.fn().mockReturnValue({}),
      rootDirectory: '/root',
      fileSystem: {},
    } as unknown as jest.Mocked<IProject>;

    mockWorkspace = {
      loadPlan: jest.fn(),
      savePlan: jest.fn(),
    } as unknown as jest.Mocked<IWorkspace>;

    mockSkill = {
      execute: jest.fn(),
    };

    mockSkillRegistry = {
      getSkill: jest.fn().mockReturnValue(mockSkill),
      getSkills: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<ISkillRegistry>;

    mockDriverRegistry = {} as unknown as jest.Mocked<DriverRegistry>;

    mockEvolution = {
      retrieve: jest.fn(),
      getLogSummary: jest.fn(),
    } as unknown as jest.Mocked<IEvolutionService>;

    mockBus = {
      sendRequest: jest.fn(),
      waitForResponse: jest.fn(),
    } as unknown as jest.Mocked<FileSystemBus>;

    mockPromptEngine = {
      renderString: jest.fn(),
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
    it('should create a plan successfully', async () => {
      const mockArch = new Architecture('');
      const validYaml = 'plan_name: test\ntasks: []';

      mockSkill.execute.mockResolvedValue(Result.ok(validYaml));

      const mockPlan = new Plan('test');
      mockWorkspace.loadPlan.mockResolvedValue(mockPlan);

      const result = await agent.plan(mockArch, 'user request');

      expect(mockSkillRegistry.getSkill).toHaveBeenCalledWith('planner');
      expect(mockSkill.execute).toHaveBeenCalled();
      expect(mockWorkspace.savePlan).toHaveBeenCalled();
      expect(result).toBe(mockPlan);
    });

    it('should throw if skill execution fails', async () => {
      const mockArch = new Architecture('');
      mockSkill.execute.mockResolvedValue(Result.fail(new Error('Skill failed')));

      await expect(agent.plan(mockArch, 'req')).rejects.toThrow('Skill failed');
    });

    it('should throw if skill not found', async () => {
      const mockArch = new Architecture('');
      mockSkillRegistry.getSkill.mockReturnValue(undefined);

      await expect(agent.plan(mockArch, 'req')).rejects.toThrow("Skill 'planner' not found");
    });

    it('should throw and log error if plan YAML is invalid', async () => {
      const mockArch = new Architecture('');
      const invalidYaml = 'invalid: yaml: : :';
      mockSkill.execute.mockResolvedValue(Result.ok(invalidYaml));

      await expect(agent.plan(mockArch, 'req')).rejects.toThrow();
      expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Failed to parse plan YAML'));
    });

    it('should provide working context handlers', async () => {
      let capturedContext: ISkillContext | undefined;
      mockSkill.execute.mockImplementation(async (context: ISkillContext) => {
        capturedContext = context;
        return Result.ok('plan_name: ok\ntasks: []');
      });
      const mockArch = new Architecture('');
      mockWorkspace.loadPlan.mockResolvedValue(new Plan('ok'));

      await agent.plan(mockArch, 'req');

      expect(capturedContext).toBeDefined();

      // 1. Test clarificationHandler (Successful)
      const question = 'What?';
      mockBus.waitForResponse.mockResolvedValue({
        id: 'res1',
        source: 'architect',
        payload: {
          answers: {
            [question]: 'Answer',
          },
        },
      });

      const ans = await capturedContext!.clarificationHandler(question);

      expect(mockHost.log).toHaveBeenCalledWith('info', expect.stringContaining('Planner requesting clarification'));
      expect(mockBus.sendRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'planner',
          type: 'request',
        }),
      );
      expect(mockBus.waitForResponse).toHaveBeenCalled();
      expect(ans).toBe('Answer');

      // 2. Test clarificationHandler (Missing answer)
      mockBus.waitForResponse.mockResolvedValue({
        id: 'res2',
        source: 'architect',
        payload: { answers: {} },
      });
      const emptyAns = await capturedContext!.clarificationHandler('Other?');
      expect(emptyAns).toBe('');

      // 3. Test commandRunner
      (mockShellExecute as any).mockResolvedValue({ stdout: 'done', stderr: '', code: 0 });
      const out = await capturedContext!.commandRunner('cmd', ['args']);
      expect(mockShellExecute).toHaveBeenCalledWith('cmd', ['args']);
      expect(out).toBe('done');

      await capturedContext!.commandRunner('ls');
      expect(mockShellExecute).toHaveBeenCalledWith('ls', []);
    });
    it('should handle non-Error exceptions during plan parsing', async () => {
      const mockArch = new Architecture('');
      mockSkill.execute.mockResolvedValue(Result.ok('plan_name: ok\ntasks: []'));
      // Mock Plan.fromYaml using spyOn since it's a static method on the imported class
      const planSpy = jest.spyOn(Plan, 'fromYaml').mockImplementation(() => {
        throw new Error('string error');
      });

      await expect(agent.plan(mockArch, 'req')).rejects.toThrow('string error');
      expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Failed to parse plan YAML'));

      planSpy.mockRestore();
    });

    it('should handle skill execution fail without error object', async () => {
      const mockArch = new Architecture('');
      mockSkill.execute.mockResolvedValue(Result.fail(undefined as any));
      await expect(agent.plan(mockArch, 'req')).rejects.toThrow('Skill execution failed');
    });

    it('should cover String(e) fallback in YAML parsing error', async () => {
      const mockArch = new Architecture('');
      mockSkill.execute.mockResolvedValue(Result.ok('plan_name: ok'));
      jest.spyOn(Plan, 'fromYaml').mockImplementation(() => {
        throw 'string parse error';
      });

      await expect(agent.plan(mockArch, 'req')).rejects.toThrow('string parse error');
      expect(mockHost.log).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Failed to parse plan YAML: string parse error'),
      );
      (Plan.fromYaml as jest.Mock).mockRestore();
    });

    it('should handle clarificationHandler with missing data/answers', async () => {
      let capturedContext: ISkillContext | undefined;
      mockSkill.execute.mockImplementation(async (context: ISkillContext) => {
        capturedContext = context;
        return Result.ok('plan_name: ok\ntasks: []');
      });
      const mockArch = new Architecture('');
      mockWorkspace.loadPlan.mockResolvedValue(new Plan('ok'));

      await agent.plan(mockArch, 'req');

      // Case 1: payload is null
      mockBus.waitForResponse.mockResolvedValue({ id: '1', source: 'a', payload: null });
      const ans1 = await capturedContext!.clarificationHandler('Q?');
      expect(ans1).toBe('');

      const ans2 = await capturedContext!.clarificationHandler('Q?');
      expect(ans2).toBe('');
    });

    it('should cover skill map callback in plan params', async () => {
      const mockArch = new Architecture('');
      mockSkill.execute.mockResolvedValue(Result.ok('plan_name: ok\ntasks: []'));
      mockSkillRegistry.getSkills.mockReturnValue([{ name: 's1', description: 'd1' }] as any);
      mockWorkspace.loadPlan.mockResolvedValue(new Plan('ok'));

      await agent.plan(mockArch, 'req');

      const capturedParams = (mockSkill.execute.mock.calls[0][0] as any).params;
      expect(capturedParams.agent_skills).toBe(JSON.stringify([{ name: 's1', description: 'd1' }]));
    });
  });
});
