import { jest } from '@jest/globals';

import { ArchitectAgent } from '../../../src/agents/ArchitectAgent.js';
import { Architecture } from '../../../src/domain/Architecture.js';
import { IDriver } from '../../../src/domain/Driver.js';
import { IProject } from '../../../src/domain/Project.js';
import { Result } from '../../../src/domain/Result.js';
import { IWorkspace } from '../../../src/domain/Workspace.js';
import { IDriverRegistry } from '../../../src/drivers/DriverRegistry.js';
import { IEvolutionService } from '../../../src/services/EvolutionService.js';
import { IPromptEngine } from '../../../src/services/PromptEngine.js';

describe('ArchitectAgent', () => {
  let agent: ArchitectAgent;
  let mockProject: jest.Mocked<IProject>;
  let mockWorkspace: jest.Mocked<IWorkspace>;
  let mockPromptEngine: jest.Mocked<IPromptEngine>;
  let mockDriverRegistry: jest.Mocked<IDriverRegistry>;
  let mockEvolution: jest.Mocked<IEvolutionService>;
  let mockDriver: jest.Mocked<IDriver>;

  beforeEach(() => {
    mockProject = {
      getConstraints: jest.fn().mockReturnValue('constraints'),
      paths: {
        architecturePrompt: 'arch_prompt_path',
        architectureCurrent: 'arch_current_path',
        personas: 'personas_path',
      },
      getConfig: jest.fn().mockReturnValue({ agents: { architect: { skill: 'arch_skill', driver: 'test_driver' } } }),
    } as unknown as jest.Mocked<IProject>;

    mockWorkspace = {
      getArchitecture: jest.fn(),
      archiveArtifacts: jest.fn(),
    } as unknown as jest.Mocked<IWorkspace>;

    mockPromptEngine = {
      render: jest.fn().mockReturnValue('rendered content'),
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

    mockEvolution = {
      getLogSummary: jest.fn().mockReturnValue('evolution log'),
    } as unknown as jest.Mocked<IEvolutionService>;

    agent = new ArchitectAgent(mockProject, mockWorkspace, mockPromptEngine, mockDriverRegistry, mockEvolution);
  });

  it('should be defined', () => {
    expect(agent).toBeDefined();
  });

  describe('design', () => {
    it('should execute design process successfully', async () => {
      const mockResult = Result.ok('some data');
      mockDriver.execute.mockResolvedValue(mockResult);

      const mockArchitecture = { id: 'arch1', data: {}, raw: '', content: '' } as unknown as Architecture;
      mockWorkspace.getArchitecture.mockResolvedValue(mockArchitecture);

      const result = await agent.design('user request');

      expect(mockPromptEngine.render.bind(mockPromptEngine)).toHaveBeenCalled();
      expect(mockDriverRegistry.get.bind(mockDriverRegistry)).toHaveBeenCalledWith('test_driver');
      expect(mockDriver.execute.bind(mockDriver)).toHaveBeenCalled();
      expect(mockWorkspace.getArchitecture.bind(mockWorkspace)).toHaveBeenCalledWith('current');
      expect(mockWorkspace.archiveArtifacts.bind(mockWorkspace)).toHaveBeenCalled();
      expect(result).toBe(mockArchitecture);
    });

    it('should throw if no driver available', async () => {
      mockDriverRegistry.get.mockReturnValue(undefined);
      mockDriverRegistry.getDefault.mockReturnValue(undefined);

      await expect(agent.design('req')).rejects.toThrow('No driver available');
    });

    it('should throw if driver execution fails', async () => {
      const mockResult = Result.fail<string>(new Error('Driver failed'));
      mockDriver.execute.mockResolvedValue(mockResult);

      await expect(agent.design('req')).rejects.toThrow('Driver failed');
    });

    it('should use default values if config is missing', async () => {
      const mockResult = Result.ok('data');
      mockDriver.execute.mockResolvedValue(mockResult);
      mockWorkspace.getArchitecture.mockResolvedValue({} as unknown as Architecture);

      mockProject.getConfig.mockReturnValue({}); // Empty config

      await agent.design('req');

      expect(mockDriverRegistry.get.bind(mockDriverRegistry)).toHaveBeenCalledWith('gemini');
      expect(mockDriver.execute.bind(mockDriver)).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'architect' }),
        expect.anything(),
      );
    });

    it('should fallback to default driver if requested driver not found', async () => {
      const mockResult = Result.ok('data');
      mockDriver.execute.mockResolvedValue(mockResult);
      mockWorkspace.getArchitecture.mockResolvedValue({} as Architecture);

      mockDriverRegistry.get.mockReturnValue(undefined);
      mockDriverRegistry.getDefault.mockReturnValue(mockDriver);

      await agent.design('req');

      expect(mockDriverRegistry.getDefault.bind(mockDriverRegistry)).toHaveBeenCalled();
      expect(mockDriver.execute.bind(mockDriver)).toHaveBeenCalled();
    });
  });
});
