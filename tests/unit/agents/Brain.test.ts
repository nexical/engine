import { jest } from '@jest/globals';

import { Brain } from '../../../src/agents/Brain.js';
import { IProject } from '../../../src/domain/Project.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { IWorkspace } from '../../../src/domain/Workspace.js';
import { IDriverRegistry } from '../../../src/drivers/DriverRegistry.js';
import { IEvolutionService } from '../../../src/services/EvolutionService.js';
import { IPromptEngine } from '../../../src/services/PromptEngine.js';
import { ISkillRegistry } from '../../../src/services/SkillRegistry.js';

describe('Brain', () => {
  let brain: Brain;
  let mockProject: jest.Mocked<IProject>;
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockDriverRegistry: jest.Mocked<IDriverRegistry>;
  let mockPromptEngine: jest.Mocked<IPromptEngine>;
  let mockSkillRegistry: jest.Mocked<ISkillRegistry>;
  let mockEvolution: jest.Mocked<IEvolutionService>;

  beforeEach(() => {
    mockProject = {
      paths: { drivers: 'drivers_path' },
    } as unknown as jest.Mocked<IProject>;
    mockHost = {
      log: jest.fn(),
      status: jest.fn(),
      ask: jest.fn(),
      emit: jest.fn(),
    } as unknown as jest.Mocked<IRuntimeHost>;
    mockDriverRegistry = {
      load: jest.fn(),
      get: jest.fn(),
      getDefault: jest.fn(),
    } as unknown as jest.Mocked<IDriverRegistry>;
    mockPromptEngine = {} as unknown as jest.Mocked<IPromptEngine>;
    mockSkillRegistry = {
      init: jest.fn(),
      getSkill: jest.fn(),
    } as unknown as jest.Mocked<ISkillRegistry>;
    mockEvolution = {} as unknown as jest.Mocked<IEvolutionService>;

    brain = new Brain(mockProject, mockHost, {
      driverRegistry: mockDriverRegistry,
      promptEngine: mockPromptEngine,
      skillRegistry: mockSkillRegistry,
      evolution: mockEvolution,
    });
  });

  it('should be defined', () => {
    expect(brain).toBeDefined();
  });

  describe('init', () => {
    it('should initialize components', async () => {
      await brain.init();
      expect(mockDriverRegistry.load).toHaveBeenCalledWith('drivers_path');
      expect(mockSkillRegistry.init).toHaveBeenCalled();
    });
  });

  describe('accessors', () => {
    it('should return dependencies', () => {
      expect(brain.getPromptEngine()).toBe(mockPromptEngine);
      expect(brain.getSkillRegistry()).toBe(mockSkillRegistry);
      expect(brain.getEvolution()).toBe(mockEvolution);
    });

    it('should proxy driver requests', () => {
      brain.getDriver('test');
      expect(mockDriverRegistry.get).toHaveBeenCalledWith('test');
      brain.getDefaultDriver();
      expect(mockDriverRegistry.getDefault).toHaveBeenCalled();
    });
  });

  describe('agents', () => {
    it('should register and create agents', () => {
      const factory = jest.fn().mockReturnValue('agent_instance');
      brain.registerAgent('test_agent', factory);

      const workspace = {} as IWorkspace;
      const instance = brain.createAgent('test_agent', workspace);

      expect(factory).toHaveBeenCalledWith(workspace);
      expect(instance).toBe('agent_instance');
    });

    it('should throw for unknown agent', () => {
      const workspace = {} as IWorkspace;
      expect(() => brain.createAgent('unknown', workspace)).toThrow("Agent type 'unknown' not registered");
    });

    it('should create architect, planner, and executor agents', () => {
      // Register mocks
      brain.registerAgent('architect', () => 'architect_instance');
      brain.registerAgent('planner', () => 'planner_instance');
      brain.registerAgent('executor', () => 'executor_instance');

      const workspace = {} as IWorkspace;
      expect(brain.createArchitect(workspace)).toBe('architect_instance');
      expect(brain.createPlanner(workspace)).toBe('planner_instance');
      expect(brain.createExecutor(workspace)).toBe('executor_instance');
    });
  });
});
