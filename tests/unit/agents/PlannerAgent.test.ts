import { jest } from '@jest/globals';
import { PlannerAgent } from '../../../src/agents/PlannerAgent.js';
import { Architecture } from '../../../src/domain/Architecture.js';
import { Plan } from '../../../src/domain/Plan.js';
import { IProject } from '../../../src/domain/Project.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { IWorkspace } from '../../../src/domain/Workspace.js';
import { IEvolutionService } from '../../../src/services/EvolutionService.js';
import { ISkillRegistry } from '../../../src/services/SkillRegistry.js';
import { DriverRegistry } from '../../../src/drivers/DriverRegistry.js';
import { FileSystemBus } from '../../../src/services/FileSystemBus.js';
import { IPromptEngine } from '../../../src/services/PromptEngine.js';
import { Result } from '../../../src/domain/Result.js';

describe('PlannerAgent', () => {
  let agent: PlannerAgent;
  let mockProject: jest.Mocked<IProject>;
  let mockWorkspace: jest.Mocked<IWorkspace>;
  let mockSkillRegistry: jest.Mocked<ISkillRegistry>;
  let mockDriverRegistry: jest.Mocked<DriverRegistry>;
  let mockEvolution: jest.Mocked<IEvolutionService>;
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockBus: jest.Mocked<FileSystemBus>;
  let mockPromptEngine: jest.Mocked<IPromptEngine>;
  let mockSkill: any;

  beforeEach(() => {
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
    } as unknown as jest.Mocked<ISkillRegistry>;

    mockDriverRegistry = {} as unknown as jest.Mocked<DriverRegistry>;

    mockEvolution = {
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
      const mockArch = { data: {} } as Architecture;
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
      const mockArch = { data: {} } as Architecture;
      mockSkill.execute.mockResolvedValue(Result.fail(new Error('Skill failed')));

      await expect(agent.plan(mockArch, 'req')).rejects.toThrow('Skill failed');
    });

    it('should throw if skill not found', async () => {
      const mockArch = { data: {} } as Architecture;
      mockSkillRegistry.getSkill.mockReturnValue(undefined);

      await expect(agent.plan(mockArch, 'req')).rejects.toThrow("Skill 'planner' not found");
    });

    it('should throw and log error if plan YAML is invalid', async () => {
      const mockArch = { data: {} } as Architecture;
      const invalidYaml = 'invalid: yaml: : :';
      mockSkill.execute.mockResolvedValue(Result.ok(invalidYaml));

      await expect(agent.plan(mockArch, 'req')).rejects.toThrow();
      expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Failed to parse plan YAML'));
    });
  });
});
