import { jest } from '@jest/globals';
import { ArchitectAgent } from '../../../src/agents/ArchitectAgent.js';
import { Architecture } from '../../../src/domain/Architecture.js';
import { IProject } from '../../../src/domain/Project.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { IWorkspace } from '../../../src/domain/Workspace.js';
import { IEvolutionService } from '../../../src/services/EvolutionService.js';
import { ISkillRegistry } from '../../../src/services/SkillRegistry.js';
import { DriverRegistry } from '../../../src/drivers/DriverRegistry.js';
import { FileSystemBus } from '../../../src/services/FileSystemBus.js';
import { IPromptEngine } from '../../../src/services/PromptEngine.js';
import { Result } from '../../../src/domain/Result.js';

describe('ArchitectAgent', () => {
  let agent: ArchitectAgent;
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
        architecturePrompt: 'arch_prompt',
        architectureCurrent: 'arch_current',
        personas: 'personas_path',
      },
      getConfig: jest.fn().mockReturnValue({}),
      rootDirectory: '/root',
    } as unknown as jest.Mocked<IProject>;

    mockWorkspace = {
      saveArchitecture: jest.fn(),
      getArchitecture: jest.fn(),
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
      watchInbox: jest.fn(),
    } as unknown as jest.Mocked<FileSystemBus>;

    mockPromptEngine = {
      renderString: jest.fn(),
    } as unknown as jest.Mocked<IPromptEngine>;


    agent = new ArchitectAgent(
      mockProject,
      mockWorkspace,
      mockSkillRegistry,
      mockDriverRegistry,
      mockEvolution,
      mockHost,
      mockBus,
      mockPromptEngine
    );
  });

  it('should be defined', () => {
    expect(agent).toBeDefined();
  });

  describe('design', () => {
    it('should execute design process successfully', async () => {
      const mockArch = { data: {} } as Architecture;
      const validYaml = 'architecture: valid';

      mockSkill.execute.mockResolvedValue(Result.ok(validYaml));
      mockWorkspace.getArchitecture.mockResolvedValue(mockArch);

      const result = await agent.design('user request');

      expect(mockSkillRegistry.getSkill).toHaveBeenCalledWith('architect');
      expect(mockSkill.execute).toHaveBeenCalled();
      expect(result).toBe(mockArch);
    });

    it('should throw if skill execution fails', async () => {
      mockSkill.execute.mockResolvedValue(Result.fail(new Error('Skill failed')));
      await expect(agent.design('req')).rejects.toThrow('Skill failed');
    });
  });
});
