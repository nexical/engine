import { jest } from '@jest/globals';

import { ArchitectAgent } from '../../../src/agents/ArchitectAgent.js';
import { Executor } from '../../../src/agents/Executor.js';
import { PlannerAgent } from '../../../src/agents/PlannerAgent.js';
import { IFileSystem } from '../../../src/domain/IFileSystem.js';
import { IProject } from '../../../src/domain/Project.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { IWorkspace } from '../../../src/domain/Workspace.js';

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
const mockSkillRegistry = {};
const mockEvolutionService = {};
const mockFileSystemBus = {};
const mockContainer = {
  register: jest.fn(),
  registerFactory: jest.fn(),
  resolve: jest.fn(),
};

const factories: Record<string, (...args: unknown[]) => unknown> = {};
mockContainer.registerFactory.mockImplementation((key: unknown, factory: unknown) => {
  if (typeof key === 'string' && typeof factory === 'function') {
    factories[key] = factory as (...args: unknown[]) => unknown;
  }
});

// Mock Constructors
const MockProject = jest.fn().mockReturnValue(mockProject);
const MockWorkspace = jest.fn().mockReturnValue(mockWorkspace);
const MockBrain = jest.fn().mockReturnValue(mockBrain);
const MockSession = jest.fn().mockReturnValue(mockSession);
const MockFileSystemService = jest.fn().mockReturnValue(mockFileSystem);
const MockDriverRegistry = jest.fn().mockReturnValue(mockDriverRegistry);
const MockPromptEngine = jest.fn().mockReturnValue(mockPromptEngine);
const MockSkillRegistry = jest.fn().mockReturnValue(mockSkillRegistry);
const MockEvolutionService = jest.fn().mockReturnValue(mockEvolutionService);
const MockFileSystemBus = jest.fn().mockReturnValue(mockFileSystemBus);
const MockDIContainer = jest.fn().mockReturnValue(mockContainer);
const MockArchitectAgent = jest.fn<() => ArchitectAgent>();
const MockPlannerAgent = jest.fn<() => PlannerAgent>();
const MockExecutor = jest.fn<() => Executor>();

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
jest.unstable_mockModule('../../../src/services/SkillRegistry.js', () => ({ SkillRegistry: MockSkillRegistry }));
jest.unstable_mockModule('../../../src/services/EvolutionService.js', () => ({
  EvolutionService: MockEvolutionService,
}));
jest.unstable_mockModule('../../../src/services/FileSystemBus.js', () => ({ FileSystemBus: MockFileSystemBus }));

jest.unstable_mockModule('../../../src/services/DIContainer.js', () => ({ DIContainer: MockDIContainer }));
jest.unstable_mockModule('../../../src/agents/ArchitectAgent.js', () => ({ ArchitectAgent: MockArchitectAgent }));
jest.unstable_mockModule('../../../src/agents/PlannerAgent.js', () => ({ PlannerAgent: MockPlannerAgent }));
jest.unstable_mockModule('../../../src/agents/Executor.js', () => ({ Executor: MockExecutor }));
const MockGitService = jest.fn().mockImplementation(() => ({}));
jest.unstable_mockModule('../../../src/services/GitService.js', () => ({ GitService: MockGitService }));

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
        case 'skillRegistry':
          return mockSkillRegistry;
        case 'evolutionService':
          return mockEvolutionService;
        case 'fileSystemBus':
          return mockFileSystemBus;
        case 'gitService':
          return {};
        case 'architect': {
          const factory = factories['architect'];
          return factory ? factory() : (): ArchitectAgent => MockArchitectAgent();
        }
        case 'planner': {
          const factory = factories['planner'];
          return factory ? factory() : (): PlannerAgent => MockPlannerAgent();
        }
        case 'executor': {
          const factory = factories['executor'];
          return factory ? factory() : (): Executor => MockExecutor();
        }
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
    expect(mockContainer.registerFactory).toHaveBeenCalledWith('skillRegistry', expect.any(Function));
    expect(mockContainer.registerFactory).toHaveBeenCalledWith('evolutionService', expect.any(Function));
    expect(mockContainer.registerFactory).toHaveBeenCalledWith('brain', expect.any(Function));
    expect(mockContainer.registerFactory).toHaveBeenCalledWith('session', expect.any(Function));
    expect(mockContainer.registerFactory).toHaveBeenCalledWith('fileSystemBus', expect.any(Function));

    // Result Verify
    expect(services.project).toBe(mockProject);
    expect(services.brain).toBe(mockBrain);
    expect(services.workspace).toBe(mockWorkspace);
    expect(services.session).toBe(mockSession);
    // expect(mockBrain.init).toHaveBeenCalled(); // Brain init detached
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

    // Test SkillRegistry Factory
    factories['skillRegistry']?.();
    expect(MockSkillRegistry).toHaveBeenCalledWith(mockProject, mockDriverRegistry, mockHost);

    // Test FileSystemBus Factory
    factories['fileSystemBus']?.();
    expect(MockFileSystemBus).toHaveBeenCalledWith(mockProject, mockFileSystem);

    // Test Brain Factory
    factories['brain']?.();
    expect(MockBrain).toHaveBeenCalledWith(
      mockProject,
      mockHost,
      expect.objectContaining({
        driverRegistry: mockDriverRegistry,
        promptEngine: mockPromptEngine,
        skillRegistry: mockSkillRegistry,
        evolution: mockEvolutionService,
      }),
    );

    // Test Brain Agent Registration
    expect(mockBrain.registerAgent).toHaveBeenCalledWith('architect', expect.any(Function));
    expect(mockBrain.registerAgent).toHaveBeenCalledWith('planner', expect.any(Function));
    expect(mockBrain.registerAgent).toHaveBeenCalledWith('executor', expect.any(Function));

    // Test Agent Factories (inside Brain registration triggers resolution)
    // We simulate agent registration calling the factory.
    // In real code `container.resolve('architect')` is called inside registration callback.
    // Here we need to check if container.resolve was called for agents.
    // But ServiceFactory creates factories for agents separately inside 'brain'.
    // `container.registerFactory('architect', ...)` is called inside 'brain' factory.
    // So we need to call brain factory first (which we did).

    // Check inner registerFactory calls
    expect(mockContainer.registerFactory).toHaveBeenCalledWith('architect', expect.any(Function));
    expect(mockContainer.registerFactory).toHaveBeenCalledWith('planner', expect.any(Function));

    // Test Architect Factory
    const archFactory = factories['architect'];
    if (archFactory) {
      // It returns a function that takes workspace
      const creator = archFactory() as (w: IWorkspace) => ArchitectAgent;
      creator(mockWorkspace as unknown as IWorkspace);
      expect(MockArchitectAgent).toHaveBeenCalledWith(
        mockProject,
        mockWorkspace,
        mockSkillRegistry,
        mockDriverRegistry,
        mockEvolutionService,
        mockHost,
        mockFileSystemBus,
        mockPromptEngine,
      );
    }

    // Test Planner Factory
    const plannerFactory = factories['planner'];
    if (plannerFactory) {
      const creator = plannerFactory() as (w: IWorkspace) => PlannerAgent;
      creator(mockWorkspace as unknown as IWorkspace);
      expect(MockPlannerAgent).toHaveBeenCalledWith(
        mockProject,
        mockWorkspace,
        mockSkillRegistry,
        mockDriverRegistry,
        mockEvolutionService,
        mockHost,
        mockFileSystemBus,
        mockPromptEngine,
      );
    }

    // Test Workspace Factory
    factories['workspace']?.();
    expect(MockWorkspace).toHaveBeenCalledWith(mockProject);

    // Test Session Factory
    factories['session']?.();
    expect(MockSession).toHaveBeenCalledWith(mockProject, mockWorkspace, mockBrain, mockHost);

    // Test GitService Factory
    factories['gitService']?.();
    expect(MockGitService).toHaveBeenCalledWith(mockHost, '/root');

    // Test EvolutionService Factory
    factories['evolutionService']?.();
    expect(MockEvolutionService).toHaveBeenCalledWith(mockProject, mockFileSystem);

    // Test Executor Factory (via Brain registration)
    // We need to capture the callback passed to brain.registerAgent('executor', cb)
    const registerCalls = mockBrain.registerAgent.mock.calls;
    const executorCall = registerCalls.find((c) => c[0] === 'executor');
    if (executorCall) {
      const executorFactory = executorCall[1] as (w: IWorkspace) => Executor;
      executorFactory(mockWorkspace as unknown as IWorkspace);

      expect(MockExecutor).toHaveBeenCalledWith(
        mockProject,
        mockWorkspace,
        mockSkillRegistry,
        mockDriverRegistry,
        mockHost,
        expect.anything(), // gitService (mocked as {})
        mockFileSystemBus,
        mockPromptEngine,
      );
    }

    // Test brain.registerAgent callbacks
    // Architect Registration
    const archRegCall = registerCalls.find((c) => c[0] === 'architect');
    if (archRegCall) {
      const cb = archRegCall[1] as (w: IWorkspace) => unknown;
      cb(mockWorkspace as unknown as IWorkspace);
      // This triggers container.resolve('architect')(workspace)
      expect(mockContainer.resolve).toHaveBeenCalledWith('architect');
    }

    // Planner Registration
    const plannerRegCall = registerCalls.find((c) => c[0] === 'planner');
    if (plannerRegCall) {
      const cb = plannerRegCall[1] as (w: IWorkspace) => unknown;
      cb(mockWorkspace as unknown as IWorkspace);
      expect(mockContainer.resolve).toHaveBeenCalledWith('planner');
    }
  });
});
