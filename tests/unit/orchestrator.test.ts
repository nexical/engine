import { jest } from '@jest/globals';

const mockCreateServices = jest.fn<() => Promise<IEngineServices>>();

jest.unstable_mockModule('../../src/services/ServiceFactory.js', () => ({
  ServiceFactory: {
    createServices: mockCreateServices,
  },
}));

import { IRuntimeHost } from '../../src/domain/RuntimeHost.js';
import { Orchestrator } from '../../src/orchestrator.js';
import { IEngineServices, ServiceFactory } from '../../src/services/ServiceFactory.js';

describe('Orchestrator', () => {
  let mockHost: jest.Mocked<IRuntimeHost>;
  let orchestrator: Orchestrator;
  const rootDir = '/test/root';

  beforeEach(() => {
    mockHost = {
      emit: jest.fn(),
      log: jest.fn(),
      status: jest.fn(),
      ask: jest.fn(),
    } as unknown as jest.Mocked<IRuntimeHost>;

    orchestrator = new Orchestrator(rootDir, mockHost);
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
        project: {},
        brain: {},
        workspace: {},
        session: {},
        container: {},
      } as unknown as IEngineServices;
      mockCreateServices.mockResolvedValue(mockServices);

      await orchestrator.init();

      expect(mockCreateServices.bind(ServiceFactory)).toHaveBeenCalledWith(
        rootDir,
        expect.objectContaining({
          emit: expect.anything() as unknown,
          log: expect.anything() as unknown,
          status: expect.anything() as unknown,
        }),
      );

      // Accessors should now work
      expect(orchestrator.project).toBe(mockServices.project);
      expect(orchestrator.brain).toBe(mockServices.brain);
      expect(orchestrator.workspace).toBe(mockServices.workspace);
      expect(orchestrator.session).toBe(mockServices.session);
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
    let mockSession: { start: jest.Mock };

    beforeEach(async () => {
      mockSession = { start: jest.fn() };
      const mockServices = {
        project: {},
        brain: {},
        workspace: {},
        session: mockSession,
        container: {},
      } as unknown as IEngineServices;
      mockCreateServices.mockResolvedValue(mockServices);
      await orchestrator.init();
    });

    it('start should call session.start with interactive true by default and trim prompt', async () => {
      await orchestrator.start('  test prompt  ');
      expect(mockSession.start.bind(mockSession)).toHaveBeenCalledWith('test prompt', true);
    });

    it('execute should call session.start with interactive false', async () => {
      await orchestrator.execute('test prompt');
      expect(mockSession.start.bind(mockSession)).toHaveBeenCalledWith('test prompt', false);
    });
  });
  it('should bubble events from host to orchestrator', () => {
    const spy = jest.fn();
    orchestrator.on('test-event', spy);
    orchestrator.host.emit('test-event', 'data');
    expect(spy).toHaveBeenCalledWith('data');
    expect(mockHost.emit.bind(mockHost)).toHaveBeenCalledWith('test-event', 'data');
  });
});
