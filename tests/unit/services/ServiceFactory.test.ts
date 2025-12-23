import { jest } from '@jest/globals';

import { IFileSystem } from '../../../src/domain/IFileSystem.js';
import { IProject } from '../../../src/domain/Project.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';

// Mocks
const mockProject = {
  paths: { prompts: '/prompts' },
  rootDirectory: '/root',
} as unknown as jest.Mocked<IProject>;
const mockWorkspace = {} as Record<string, unknown>;
const mockBrain = {
  init: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  registerAgent: jest.fn(),
} as unknown as { init: jest.Mock; registerAgent: jest.Mock };
const mockSession = {};
const mockFileSystem = {} as jest.Mocked<IFileSystem>;
const mockDriverRegistry = {};
const mockPromptEngine = {};
const mockSkillRunner = {};
const mockEvolutionService = {};
const mockContainer = {
  register: jest.fn(),
  registerFactory: jest.fn(),
  resolve: jest.fn(),
};

// Mock Constructors
const MockProject = jest.fn().mockReturnValue(mockProject);
const MockWorkspace = jest.fn().mockReturnValue(mockWorkspace);
const MockBrain = jest.fn().mockReturnValue(mockBrain);
const MockSession = jest.fn().mockReturnValue(mockSession);
const MockFileSystemService = jest.fn().mockReturnValue(mockFileSystem);
const MockDriverRegistry = jest.fn().mockReturnValue(mockDriverRegistry);
const MockPromptEngine = jest.fn().mockReturnValue(mockPromptEngine);
const MockSkillRunner = jest.fn().mockReturnValue(mockSkillRunner);
const MockEvolutionService = jest.fn().mockReturnValue(mockEvolutionService);
const MockDIContainer = jest.fn().mockReturnValue(mockContainer);
const MockArchitectAgent = jest.fn();
const MockPlannerAgent = jest.fn();
const MockDeveloperAgent = jest.fn();

// Register Mocks
jest.unstable_mockModule('../../../src/domain/Project.js', () => ({ Project: MockProject }));
jest.unstable_mockModule('../../../src/domain/Workspace.js', () => ({ Workspace: MockWorkspace }));
jest.unstable_mockModule('../../../src/agents/Brain.js', () => ({ Brain: MockBrain }));
jest.unstable_mockModule('../../../src/domain/Session.js', () => ({ Session: MockSession }));
jest.unstable_mockModule('../../../src/services/FileSystemService.js', () => ({
  FileSystemService: MockFileSystemService,
}));
jest.unstable_mockModule('../../../src/drivers/DriverRegistry.js', () => ({ DriverRegistry: MockDriverRegistry }));
jest.unstable_mockModule('../../../src/services/PromptEngine.js', () => ({ PromptEngine: MockPromptEngine }));
jest.unstable_mockModule('../../../src/services/SkillRunner.js', () => ({ SkillRunner: MockSkillRunner }));
jest.unstable_mockModule('../../../src/services/EvolutionService.js', () => ({
  EvolutionService: MockEvolutionService,
}));
jest.unstable_mockModule('../../../src/services/DIContainer.js', () => ({ DIContainer: MockDIContainer }));
jest.unstable_mockModule('../../../src/agents/ArchitectAgent.js', () => ({ ArchitectAgent: MockArchitectAgent }));
jest.unstable_mockModule('../../../src/agents/PlannerAgent.js', () => ({ PlannerAgent: MockPlannerAgent }));
jest.unstable_mockModule('../../../src/agents/DeveloperAgent.js', () => ({ DeveloperAgent: MockDeveloperAgent }));

const { ServiceFactory } = await import('../../../src/services/ServiceFactory.js');

describe('ServiceFactory', () => {
  let mockHost: jest.Mocked<IRuntimeHost>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockHost = {
      log: jest.fn<IRuntimeHost['log']>(),
      status: jest.fn<IRuntimeHost['status']>(),
      ask: jest.fn<IRuntimeHost['ask']>(),
      emit: jest.fn<IRuntimeHost['emit']>(),
    };

    // Setup default container resolve behavior
    mockContainer.resolve.mockImplementation((...args: unknown[]) => {
      const key = args[0] as string;
      switch (key) {
        case 'rootDirectory':
          return '/root';
        case 'host':
          return mockHost;
        case 'fileSystem':
          return mockFileSystem;
        case 'project':
          return mockProject;
        case 'workspace':
          return mockWorkspace;
        case 'brain':
          return mockBrain;
        case 'session':
          return mockSession;
        case 'driverRegistry':
          return mockDriverRegistry;
        case 'promptEngine':
          return mockPromptEngine;
        case 'skillRunner':
          return mockSkillRunner;
        case 'evolutionService':
          return mockEvolutionService;
        default:
          return undefined;
      }
    });
  });

  it('should create services correctly', async () => {
    const services = await ServiceFactory.createServices('/root', mockHost);

    // Core Verify
    expect(MockDIContainer).toHaveBeenCalled();
    expect(mockContainer.register).toHaveBeenCalledWith('rootDirectory', '/root');
    expect(mockContainer.register).toHaveBeenCalledWith('host', mockHost);
    expect(mockContainer.register).toHaveBeenCalledWith('fileSystem', expect.anything());

    // Factories Registered
    expect(mockContainer.registerFactory).toHaveBeenCalledWith('project', expect.any(Function));
    expect(mockContainer.registerFactory).toHaveBeenCalledWith('workspace', expect.any(Function));
    expect(mockContainer.registerFactory).toHaveBeenCalledWith('driverRegistry', expect.any(Function));
    expect(mockContainer.registerFactory).toHaveBeenCalledWith('promptEngine', expect.any(Function));
    expect(mockContainer.registerFactory).toHaveBeenCalledWith('skillRunner', expect.any(Function));
    expect(mockContainer.registerFactory).toHaveBeenCalledWith('evolutionService', expect.any(Function));
    expect(mockContainer.registerFactory).toHaveBeenCalledWith('brain', expect.any(Function));
    expect(mockContainer.registerFactory).toHaveBeenCalledWith('session', expect.any(Function));

    // Result Verify
    expect(services.project).toBe(mockProject);
    expect(services.brain).toBe(mockBrain);
    expect(services.workspace).toBe(mockWorkspace);
    expect(services.session).toBe(mockSession);
    expect(mockBrain.init).toHaveBeenCalled();
  });

  it('should invoke factory callbacks correctly', async () => {
    await ServiceFactory.createServices('/root', mockHost);

    // Extract callbacks
    const calls = (mockContainer.registerFactory as jest.Mock).mock.calls;
    const factories: Record<string, ((...args: unknown[]) => unknown) | undefined> = {};
    for (const call of calls) {
      factories[call[0] as string] = call[1] as (...args: unknown[]) => unknown;
    }

    // Test Project Factory
    factories['project']?.();
    expect(MockProject).toHaveBeenCalledWith('/root', mockFileSystem);

    // Test Workspace Factory
    factories['workspace']?.();
    expect(MockWorkspace).toHaveBeenCalledWith(mockProject);

    // Test DriverRegistry Factory
    factories['driverRegistry']?.();
    expect(MockDriverRegistry).toHaveBeenCalledWith(
      mockHost,
      expect.objectContaining({ rootDirectory: '/root' }),
      mockFileSystem,
    );

    // Test PromptEngine Factory
    factories['promptEngine']?.();
    expect(MockPromptEngine).toHaveBeenCalledWith(expect.objectContaining({ promptDirectory: '/prompts' }), mockHost);

    // Test SkillRunner Factory
    factories['skillRunner']?.();
    expect(MockSkillRunner).toHaveBeenCalledWith(mockProject, mockDriverRegistry, mockPromptEngine, mockHost);

    // Test EvolutionService Factory
    factories['evolutionService']?.();
    expect(MockEvolutionService).toHaveBeenCalledWith(mockProject, mockFileSystem);

    // Test Brain Factory
    factories['brain']?.();
    expect(MockBrain).toHaveBeenCalledWith(
      mockProject,
      mockHost,
      expect.objectContaining({
        driverRegistry: mockDriverRegistry,
        promptEngine: mockPromptEngine,
        skillRunner: mockSkillRunner,
        evolution: mockEvolutionService,
      }),
    );

    // Test Brain Agent Registration
    expect(mockBrain.registerAgent).toHaveBeenCalledWith('architect', expect.any(Function));
    expect(mockBrain.registerAgent).toHaveBeenCalledWith('planner', expect.any(Function));
    expect(mockBrain.registerAgent).toHaveBeenCalledWith('developer', expect.any(Function));

    // Test Agent Factories (inside Brain registration)
    const agentCalls = mockBrain.registerAgent.mock.calls;
    const architectFactory = agentCalls.find((c) => c[0] === 'architect')?.[1];
    const plannerFactory = agentCalls.find((c) => c[0] === 'planner')?.[1];
    const developerFactory = agentCalls.find((c) => c[0] === 'developer')?.[1];

    if (architectFactory) (architectFactory as (...args: unknown[]) => unknown)(mockWorkspace);
    expect(MockArchitectAgent).toHaveBeenCalled();

    if (plannerFactory) (plannerFactory as (...args: unknown[]) => unknown)(mockWorkspace);
    expect(MockPlannerAgent).toHaveBeenCalled();

    if (developerFactory) (developerFactory as (...args: unknown[]) => unknown)(mockWorkspace);
    expect(MockDeveloperAgent).toHaveBeenCalled();

    // Test Session Factory
    factories['session']?.();
    expect(MockSession).toHaveBeenCalledWith(mockProject, mockWorkspace, mockBrain, mockHost);
  });

  it('should use provided FileSystem if passed', async () => {
    const customFs: IFileSystem = {} as unknown as jest.Mocked<IFileSystem>;
    await ServiceFactory.createServices('/root', mockHost, customFs);
    expect(mockContainer.register).toHaveBeenCalledWith('fileSystem', customFs);
  });
});
