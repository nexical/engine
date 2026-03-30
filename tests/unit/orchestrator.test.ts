import { jest } from '@jest/globals';

import type { Brain } from '../../src/agents/Brain.js';
import { IProject } from '../../src/domain/Project.js';
import { IRuntimeHost } from '../../src/domain/RuntimeHost.js';
import { Session } from '../../src/domain/Session.js';
import { IWorkspace } from '../../src/domain/Workspace.js';
import type { Orchestrator } from '../../src/orchestrator.js';
import { DIContainer } from '../../src/services/DIContainer.js';
import type { IEngineServices } from '../../src/services/ServiceFactory.js';

// 1. Setup the mock module
jest.unstable_mockModule('../../src/services/ServiceFactory.js', () => ({
  ServiceFactory: {
    createServices: jest.fn(),
  },
}));

// 2. Import the mocked module and other dependencies
const ServiceFactoryMod = (await import('../../src/services/ServiceFactory.js')) as unknown as {
  ServiceFactory: {
    createServices: jest.Mock<(root: string, host: IRuntimeHost) => Promise<IEngineServices>>;
  };
};
const mockCreateServices = ServiceFactoryMod.ServiceFactory.createServices;

const { Orchestrator: OrchestratorValue } = (await import('../../src/orchestrator.js')) as {
  Orchestrator: typeof Orchestrator;
};

describe('Orchestrator', () => {
  let mockHost: jest.Mocked<IRuntimeHost>;
  let orchestrator: InstanceType<typeof OrchestratorValue>;
  const rootDir = '/test/root';

  beforeEach(() => {
    mockHost = {
      emit: jest.fn<IRuntimeHost['emit']>(),
      log: jest.fn<IRuntimeHost['log']>(),
      status: jest.fn<IRuntimeHost['status']>(),
      ask: jest.fn<IRuntimeHost['ask']>(),
    } as unknown as jest.Mocked<IRuntimeHost>;

    orchestrator = new OrchestratorValue(rootDir, mockHost);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should instantiate correctly', () => {
    expect(orchestrator).toBeDefined();
    expect(orchestrator.rootDirectory).toBe(rootDir);
  });

  describe('init', () => {
    it('should initialize services via ServiceFactory', async () => {
      const mockServices = {
        project: {} as unknown as IProject,
        brain: { init: jest.fn() } as unknown as Brain,
        workspace: {} as unknown as IWorkspace,
        session: {} as unknown as Session,
        container: {} as unknown as DIContainer,
      } as unknown as IEngineServices;
      mockCreateServices.mockResolvedValue(mockServices);

      await orchestrator.init();

      expect(mockCreateServices).toHaveBeenCalledWith(
        rootDir,
        expect.objectContaining({
          emit: expect.any(Function) as unknown,
          log: expect.any(Function) as unknown,
          status: expect.any(Function) as unknown,
        }),
      );

      // Accessors should now work
      expect(orchestrator.project).toBe(mockServices.project);
      expect(orchestrator.brain).toBe(mockServices.brain);
      expect(orchestrator.workspace).toBe(mockServices.workspace);
      expect(orchestrator.session).toBe(mockServices.session);
    });

    it('should skip brain init if skipBrainInit is true', async () => {
      const mockBrain = { init: jest.fn() };
      const mockServices = {
        project: {} as unknown as IProject,
        brain: mockBrain as unknown as Brain,
        workspace: {} as unknown as IWorkspace,
        session: {} as unknown as Session,
        container: {} as unknown as DIContainer,
      } as unknown as IEngineServices;
      mockCreateServices.mockResolvedValue(mockServices);

      await orchestrator.init(true);

      expect(mockBrain.init).not.toHaveBeenCalled();
    });
  });

  describe('Accessors before init', () => {
    it('should throw if project accessed before init', () => {
      expect(() => orchestrator.project).toThrow('Orchestrator not initialized');
    });
    it('should throw if brain accessed before init', () => {
      expect(() => orchestrator.brain).toThrow('Orchestrator not initialized');
    });
    it('should throw if workspace accessed before init', () => {
      expect(() => orchestrator.workspace).toThrow('Orchestrator not initialized');
    });
    it('should throw if session accessed before init', () => {
      expect(() => orchestrator.session).toThrow('Orchestrator not initialized');
    });
  });

  describe('start/execute', () => {
    let mockSession: { start: jest.Mock<(prompt: string, interactive: boolean) => Promise<void>> };

    beforeEach(async () => {
      mockSession = { start: jest.fn() };
      const mockServices = {
        project: {
          fileSystem: {
            ensureDir: jest.fn(),
          },
          paths: {},
          getConfig: jest.fn(),
          getConstraints: jest.fn(),
        } as unknown as jest.Mocked<IProject>,
        brain: { init: jest.fn() } as unknown as jest.Mocked<Brain>,
        workspace: {} as unknown as jest.Mocked<IWorkspace>,
        session: mockSession as unknown as Session,
        container: {} as unknown as DIContainer,
      } as unknown as IEngineServices;
      mockCreateServices.mockResolvedValue(mockServices);
      await orchestrator.init();
    });

    it('start should call session.start with interactive true by default and trim prompt', async () => {
      await orchestrator.start('  test prompt  ');
      expect(mockSession.start).toHaveBeenCalledWith('test prompt', true);
    });

    it('execute should call session.start with interactive false', async () => {
      await orchestrator.execute('test prompt');
      expect(mockSession.start).toHaveBeenCalledWith('test prompt', false);
    });
  });

  it('should bubble events from host to orchestrator', () => {
    const spy = jest.fn();
    orchestrator.on('test-event', spy);
    orchestrator.host.emit('test-event', 'data');
    expect(spy).toHaveBeenCalledWith('data');

    expect(mockHost.emit).toHaveBeenCalledWith('test-event', 'data');
  });
});
