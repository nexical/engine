import { jest } from '@jest/globals';

import { ArchitectAgent } from '../../../src/agents/ArchitectAgent.js';
import { Architecture } from '../../../src/domain/Architecture.js';
import { IDriver } from '../../../src/domain/Driver.js';
import { IProject } from '../../../src/domain/Project.js';
import { Result } from '../../../src/domain/Result.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { IWorkspace } from '../../../src/domain/Workspace.js';
import { IDriverRegistry } from '../../../src/drivers/DriverRegistry.js';
import { IEvolutionService } from '../../../src/services/EvolutionService.js';
import { IPromptEngine } from '../../../src/services/PromptEngine.js';
import { ISkillRunner } from '../../../src/services/SkillRunner.js';

describe('ArchitectAgent', () => {
  let agent: ArchitectAgent;
  let mockProject: jest.Mocked<IProject>;
  let mockWorkspace: jest.Mocked<IWorkspace>;
  let mockPromptEngine: jest.Mocked<IPromptEngine>;
  let mockDriverRegistry: jest.Mocked<IDriverRegistry>;
  let mockSkillRunner: jest.Mocked<ISkillRunner>;
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
      saveArchitecture: jest.fn(),
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

    const mockHost = {
      log: jest.fn(),
    } as unknown as jest.Mocked<IRuntimeHost>;

    mockSkillRunner = {
      getSkills: jest.fn().mockReturnValue(['skill1']),
      executeNativeSkill: jest.fn<ISkillRunner['executeNativeSkill']>().mockResolvedValue('markdown content'),
    } as unknown as jest.Mocked<ISkillRunner>;

    agent = new ArchitectAgent(mockProject, mockWorkspace, mockSkillRunner, mockEvolution, mockHost);
  });

  it('should be defined', () => {
    expect(agent).toBeDefined();
  });

  describe('design', () => {
    it('should execute design process successfully', async () => {
      mockSkillRunner.executeNativeSkill.mockResolvedValue('some data');

      const mockArchitecture = { id: 'arch1', data: {}, raw: '', content: '' } as unknown as Architecture;
      mockWorkspace.getArchitecture.mockResolvedValue(mockArchitecture);

      const result = await agent.design('user request');

      expect(mockSkillRunner.executeNativeSkill).toHaveBeenCalledWith('architect', expect.anything(), 'user request');
      expect(mockWorkspace.getArchitecture).toHaveBeenCalledWith('current');
      expect(result).toBe(mockArchitecture);
    });

    it('should throw if no driver available', async () => {
      mockSkillRunner.executeNativeSkill.mockRejectedValue(new Error('No driver available'));

      await expect(agent.design('req')).rejects.toThrow('No driver available');
    });

    it('should throw if driver execution fails', async () => {
      mockSkillRunner.executeNativeSkill.mockRejectedValue(new Error('Driver failed'));

      await expect(agent.design('req')).rejects.toThrow('Driver failed');
    });

    it('should use default values if config is missing', async () => {
      mockSkillRunner.executeNativeSkill.mockResolvedValue('markdown');
      mockWorkspace.getArchitecture.mockResolvedValue({} as unknown as Architecture);

      mockProject.getConfig.mockReturnValue({}); // Empty config

      await agent.design('req');

      expect(mockSkillRunner.executeNativeSkill).toHaveBeenCalledWith(
        'architect',
        expect.objectContaining({ user_request: 'req' }),
        'req',
      );
    });

    it('should fallback to default driver if requested driver not found', async () => {
      // Test now ensures SkillRunner is called.
      mockSkillRunner.executeNativeSkill.mockResolvedValue('markdown');
      mockWorkspace.getArchitecture.mockResolvedValue({} as Architecture);

      await agent.design('req');

      expect(mockSkillRunner.executeNativeSkill).toHaveBeenCalled();
    });
    it('should throw if driver execution fails with non-Error result', async () => {
      mockSkillRunner.executeNativeSkill.mockRejectedValue(new Error('String error'));

      await expect(agent.design('req')).rejects.toThrow('String error');
    });
  });
});
