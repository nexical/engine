import { jest } from '@jest/globals';

import { PlannerAgent } from '../../../src/agents/PlannerAgent.js';
import { Architecture } from '../../../src/domain/Architecture.js';
import { IDriver } from '../../../src/domain/Driver.js';
import { Plan } from '../../../src/domain/Plan.js';
import { IProject } from '../../../src/domain/Project.js';
import { Result } from '../../../src/domain/Result.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { IWorkspace } from '../../../src/domain/Workspace.js';
import { IDriverRegistry } from '../../../src/drivers/DriverRegistry.js';
import { IEvolutionService } from '../../../src/services/EvolutionService.js';
import { IPromptEngine } from '../../../src/services/PromptEngine.js';
import { ISkillRunner } from '../../../src/services/SkillRunner.js';

describe('PlannerAgent', () => {
  let agent: PlannerAgent;
  let mockProject: jest.Mocked<IProject>;
  let mockWorkspace: jest.Mocked<IWorkspace>;
  let mockPromptEngine: jest.Mocked<IPromptEngine>;
  let mockDriverRegistry: jest.Mocked<IDriverRegistry>;
  let mockSkillRunner: jest.Mocked<ISkillRunner>;
  let mockEvolution: jest.Mocked<IEvolutionService>;
  let mockDriver: jest.Mocked<IDriver>;
  let mockHost: jest.Mocked<IRuntimeHost>;

  beforeEach(() => {
    mockHost = {
      log: jest.fn(),
    } as unknown as jest.Mocked<IRuntimeHost>;
    mockProject = {
      getConstraints: jest.fn().mockReturnValue('constraints'),
      paths: {
        plannerPrompt: 'planner_prompt',
        planCurrent: 'plan_current',
        personas: 'personas_path',
      },
      getConfig: jest.fn().mockReturnValue({ agents: { planner: { skill: 'planner_skill', driver: 'test_driver' } } }),
    } as unknown as jest.Mocked<IProject>;

    mockWorkspace = {
      loadPlan: jest.fn(),
      savePlan: jest.fn(),
    } as unknown as jest.Mocked<IWorkspace>;

    mockPromptEngine = {
      render: jest.fn().mockReturnValue('rendered prompt'),
    } as unknown as jest.Mocked<IPromptEngine>;

    mockDriver = {
      name: 'test_driver',
      description: 'test description',
      isSupported: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
      validateSkill: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
      execute: jest.fn(),
    } as unknown as jest.Mocked<IDriver>;

    mockDriverRegistry = {
      get: jest.fn().mockReturnValue(mockDriver),
      getDefault: jest.fn(),
    } as unknown as jest.Mocked<IDriverRegistry>;

    mockSkillRunner = {
      getSkills: jest.fn().mockReturnValue([]),
      executeNativeSkill: jest.fn<ISkillRunner['executeNativeSkill']>().mockResolvedValue('plan_name: test\ntasks: []'),
    } as unknown as jest.Mocked<ISkillRunner>;

    mockEvolution = {
      getLogSummary: jest.fn(),
    } as unknown as jest.Mocked<IEvolutionService>;

    agent = new PlannerAgent(mockProject, mockWorkspace, mockSkillRunner, mockEvolution, mockHost);
  });

  it('should be defined', () => {
    expect(agent).toBeDefined();
  });

  describe('plan', () => {
    it('should create a plan successfully', async () => {
      const mockArch = { data: {} } as Architecture;
      const validYaml = 'plan_name: test\ntasks: []';
      mockSkillRunner.executeNativeSkill.mockResolvedValue(validYaml);
      const mockPlan = new Plan('test');
      mockWorkspace.loadPlan.mockResolvedValue(mockPlan);

      const result = await agent.plan(mockArch, 'user request');

      expect(mockSkillRunner.executeNativeSkill).toHaveBeenCalledWith('planner', expect.anything(), 'user request');
      expect(mockWorkspace.loadPlan).toHaveBeenCalled();
      expect(result).toBe(mockPlan);
    });

    it('should throw if driver execution fails', async () => {
      const mockArch = { data: {} } as Architecture;
      mockSkillRunner.executeNativeSkill.mockRejectedValue(new Error('Driver failed'));

      await expect(agent.plan(mockArch, 'req')).rejects.toThrow('Driver failed');
    });

    it('should use default values if config is missing', async () => {
      const mockArch = { data: {} } as Architecture;
      const validYaml = 'plan_name: test\ntasks: []';
      mockSkillRunner.executeNativeSkill.mockResolvedValue(validYaml);
      mockWorkspace.loadPlan.mockResolvedValue(new Plan('empty'));

      mockProject.getConfig.mockReturnValue({}); // Empty config

      await agent.plan(mockArch, 'req');

      expect(mockSkillRunner.executeNativeSkill).toHaveBeenCalledWith(
        'planner',
        expect.objectContaining({ user_prompt: 'req' }),
        'req',
      );
    });

    it('should fallback to default driver if requested driver not found', async () => {
      // This test is less relevant now as SkillRunner handles driver selection.
      // We essentially test that agent calls executeNativeSkill correctly.
      const mockArch = { data: {} } as Architecture;
      const validYaml = 'plan_name: test\ntasks: []';
      mockSkillRunner.executeNativeSkill.mockResolvedValue(validYaml);
      mockWorkspace.loadPlan.mockResolvedValue(new Plan('fallback'));

      await agent.plan(mockArch, 'req');

      expect(mockSkillRunner.executeNativeSkill).toHaveBeenCalled();
    });

    it('should throw if no driver available', async () => {
      // SkillRunner throws this now.
      const mockArch = { data: {} } as Architecture;
      mockSkillRunner.executeNativeSkill.mockRejectedValue(new Error('No driver available'));

      await expect(agent.plan(mockArch, 'req')).rejects.toThrow('No driver available');
    });

    it('should throw "Planner execution failed" if result.error() is falsy', async () => {
      const mockArch = { data: {} } as Architecture;
      // Simulating SkillRunner throwing a specific error or generic error
      mockSkillRunner.executeNativeSkill.mockRejectedValue(new Error('Planner execution failed'));

      await expect(agent.plan(mockArch, 'req')).rejects.toThrow('Planner execution failed');
    });

    it('should throw and log error if plan YAML is invalid', async () => {
      const mockArch = { data: {} } as Architecture;
      const invalidYaml = 'invalid: yaml: content: :';
      mockSkillRunner.executeNativeSkill.mockResolvedValue(invalidYaml);

      await expect(agent.plan(mockArch, 'req')).rejects.toThrow();
      expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Failed to parse plan YAML'));
      expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining(invalidYaml));
    });

    it('should handle non-Error throw during plan parsing', async () => {
      const mockArch = { data: {} } as Architecture;
      const validYaml = 'plan: valid';
      mockSkillRunner.executeNativeSkill.mockResolvedValue(validYaml);

      const spy = jest.spyOn(Plan, 'fromYaml').mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'String Error';
      });

      await expect(agent.plan(mockArch, 'req')).rejects.toThrow('String Error');
      expect(mockHost.log).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Failed to parse plan YAML: String Error'),
      );

      spy.mockRestore();
    });
  });
});
