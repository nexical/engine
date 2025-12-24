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
    } as unknown as jest.Mocked<ISkillRunner>;

    mockEvolution = {
      getLogSummary: jest.fn(),
    } as unknown as jest.Mocked<IEvolutionService>;

    agent = new PlannerAgent(
      mockProject,
      mockWorkspace,
      mockPromptEngine,
      mockDriverRegistry,
      mockSkillRunner,
      mockEvolution,
      mockHost,
    );
  });

  it('should be defined', () => {
    expect(agent).toBeDefined();
  });

  describe('plan', () => {
    it('should create a plan successfully', async () => {
      const mockArch = { data: {} } as Architecture;
      const validYaml = 'plan_name: test\ntasks: []';
      const mockResult = Result.ok(validYaml);
      mockDriver.execute.mockResolvedValue(mockResult);
      const mockPlan = new Plan('test');
      mockWorkspace.loadPlan.mockResolvedValue(mockPlan);

      const result = await agent.plan(mockArch, 'user request');

      expect(mockPromptEngine.render).toHaveBeenCalled();
      expect(mockDriverRegistry.get).toHaveBeenCalledWith('test_driver');
      expect(mockDriver.execute).toHaveBeenCalled();
      expect(mockWorkspace.loadPlan).toHaveBeenCalled();
      expect(result).toBe(mockPlan);
    });

    it('should throw if driver execution fails', async () => {
      const mockArch = { data: {} } as Architecture;
      const mockResult = Result.fail<string>(new Error('Driver failed'));
      mockDriver.execute.mockResolvedValue(mockResult);

      await expect(agent.plan(mockArch, 'req')).rejects.toThrow('Driver failed');
    });

    it('should use default values if config is missing', async () => {
      const mockArch = { data: {} } as Architecture;
      const validYaml = 'plan_name: test\ntasks: []';
      const mockResult = Result.ok(validYaml);
      mockDriver.execute.mockResolvedValue(mockResult);
      mockWorkspace.loadPlan.mockResolvedValue(new Plan('empty'));

      mockProject.getConfig.mockReturnValue({}); // Empty config

      await agent.plan(mockArch, 'req');

      expect(mockDriverRegistry.get).toHaveBeenCalledWith('gemini');
      expect(mockDriver.execute).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'planner' }) as unknown,
        expect.anything(),
      );
    });

    it('should fallback to default driver if requested driver not found', async () => {
      const mockArch = { data: {} } as Architecture;
      const validYaml = 'plan_name: test\ntasks: []';
      const mockResult = Result.ok(validYaml);
      mockDriver.execute.mockResolvedValue(mockResult);
      mockWorkspace.loadPlan.mockResolvedValue(new Plan('fallback'));

      mockDriverRegistry.get.mockReturnValue(undefined);
      mockDriverRegistry.getDefault.mockReturnValue(mockDriver);

      await agent.plan(mockArch, 'req');

      expect(mockDriverRegistry.getDefault).toHaveBeenCalled();
      expect(mockDriver.execute).toHaveBeenCalled();
    });

    it('should throw if no driver available', async () => {
      const mockArch = { data: {} } as Architecture;
      mockDriverRegistry.get.mockReturnValue(undefined);
      mockDriverRegistry.getDefault.mockReturnValue(undefined);

      await expect(agent.plan(mockArch, 'req')).rejects.toThrow('No driver available');
    });

    it('should throw "Planner execution failed" if result.error() is falsy', async () => {
      const mockArch = { data: {} } as Architecture;
      const mockResult = Result.fail<string, unknown>(null);
      mockDriver.execute.mockResolvedValue(mockResult as unknown as Result<string, Error>);

      await expect(agent.plan(mockArch, 'req')).rejects.toThrow('Planner execution failed');
    });

    it('should throw and log error if plan YAML is invalid', async () => {
      const mockArch = { data: {} } as Architecture;
      const invalidYaml = 'invalid: yaml: content: :';
      const mockResult = Result.ok(invalidYaml);
      mockDriver.execute.mockResolvedValue(mockResult);

      await expect(agent.plan(mockArch, 'req')).rejects.toThrow();
      expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Failed to parse plan YAML'));
    });

    it('should handle non-Error throw during plan parsing', async () => {
      const mockArch = { data: {} } as Architecture;
      const validYaml = 'plan: valid';
      const mockResult = Result.ok(validYaml);
      mockDriver.execute.mockResolvedValue(mockResult);

      const spy = jest.spyOn(Plan, 'fromYaml').mockImplementation(() => {
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
