
import { jest } from '@jest/globals';

const mockCreateServices = jest.fn();

jest.unstable_mockModule('../../src/services/ServiceFactory.js', () => ({
    ServiceFactory: {
        createServices: mockCreateServices
    }
}));

const { Orchestrator } = await import('../../src/orchestrator.js');
const { ServiceFactory } = await import('../../src/services/ServiceFactory.js');
const { RuntimeHost } = await import('../../src/domain/RuntimeHost.js');

describe('Orchestrator', () => {
    let mockHost: any;
    let orchestrator: Orchestrator;
    const rootDir = '/test/root';

    beforeEach(() => {
        mockHost = {
            emit: jest.fn(),
            log: jest.fn(),
            error: jest.fn(),
        };

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
                session: {}
            };
            mockCreateServices.mockResolvedValue(mockServices);

            await orchestrator.init();

            expect(mockCreateServices).toHaveBeenCalledWith(rootDir, expect.objectContaining({
                emit: expect.any(Function),
                log: expect.any(Function),
                error: expect.any(Function)
            }));

            // Accessors should now work
            expect(orchestrator.project).toBe(mockServices.project);
            expect(orchestrator.brain).toBe(mockServices.brain);
            expect(orchestrator.workspace).toBe(mockServices.workspace);
            expect(orchestrator.session).toBe(mockServices.session);
        });
    });

    describe('Accessors before init', () => {
        it('should throw if project accessed before init', () => {
            expect(() => orchestrator.project).toThrow("Orchestrator not initialized");
        });
        it('should throw if brain accessed before init', () => {
            expect(() => orchestrator.brain).toThrow("Orchestrator not initialized");
        });
        it('should throw if workspace accessed before init', () => {
            expect(() => orchestrator.workspace).toThrow("Orchestrator not initialized");
        });
        it('should throw if session accessed before init', () => {
            expect(() => orchestrator.session).toThrow("Orchestrator not initialized");
        });
    });

    describe('start/execute', () => {
        let mockSession: any;

        beforeEach(async () => {
            mockSession = { start: jest.fn() };
            const mockServices = {
                project: {},
                brain: {},
                workspace: {},
                session: mockSession
            };
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
