import { jest, expect, describe, it, beforeEach, afterEach } from '@jest/globals';
import { Job } from '@nexical/sdk';

// Mock dependencies
const mockClientKeys = {
    jobs: {
        addLog: jest.fn(),
    },
    auth: {
        enrollWorker: jest.fn(),
    },
    workers: {
        acquireJob: jest.fn(),
    },
    setToken: jest.fn(),
};

const mockNexicalClient = jest.fn(() => mockClientKeys);

const mockWorkerStart = jest.fn();
const mockWorkerStop = jest.fn();
const mockNexicalWorker = jest.fn(() => ({
    start: mockWorkerStart,
    stop: mockWorkerStop,
}));

jest.unstable_mockModule('@nexical/sdk', () => ({
    NexicalClient: mockNexicalClient,
    NexicalWorker: mockNexicalWorker,
}));

// Mock Orchestrator
const mockOrchestratorInit = jest.fn();
const mockRunAIWorkflow = jest.fn();
const mockExecute = jest.fn();
const mockOrchestrator = jest.fn(() => ({
    init: mockOrchestratorInit,
    runAIWorkflow: mockRunAIWorkflow,
    execute: mockExecute,
}));
jest.unstable_mockModule('../../../src/orchestrator.js', () => ({
    Orchestrator: mockOrchestrator
}));

// Mock WorkspaceManager
const mockCreateWorkspace = jest.fn<(id: string) => Promise<string>>();
const mockCleanupWorkspace = jest.fn<(id: string) => Promise<void>>();
const mockSetupGlobalCache = jest.fn<() => Promise<void>>();
const mockWorkspaceManager = jest.fn(() => ({
    createWorkspace: mockCreateWorkspace,
    cleanupWorkspace: mockCleanupWorkspace,
    setupGlobalCache: mockSetupGlobalCache,
}));
jest.unstable_mockModule('../../../src/services/WorkspaceManager.js', () => ({
    WorkspaceManager: mockWorkspaceManager
}));

// Import FactoryWorker - using dynamic import if needed, but since we refactored, we can import class
const { FactoryWorker } = await import('../../../src/worker.js');

describe('FactoryWorker Integration', () => {
    let factoryWorker: any;

    beforeEach(() => {
        jest.clearAllMocks();
        // Initialize FactoryWorker with mocks injected via constructor or let it create them (mocked via module)
        // Since we mocked @nexical/sdk module, new NexicalClient() returns the mock.
        factoryWorker = new FactoryWorker();
    });

    it('should start worker and process job with prompt', async () => {
        const job = {
            id: 123,
            projectId: 456,
            teamId: 789,
            type: 'run_orchestrator',
            inputs: { prompt: 'do something' }
        };

        // Mock worker.start to call processor immediately
        mockWorkerStart.mockImplementation(async (processor: any) => {
            await processor(job);
        });

        // Mock WorkspaceManager
        mockCreateWorkspace.mockResolvedValue('/tmp/job-123');

        await factoryWorker.start();

        // Verify flow
        expect(mockSetupGlobalCache).toHaveBeenCalled();
        expect(mockWorkerStart).toHaveBeenCalled();
        expect(mockCreateWorkspace).toHaveBeenCalledWith('123');
        expect(mockOrchestratorInit).toHaveBeenCalled();
        expect(mockRunAIWorkflow).toHaveBeenCalledWith('do something');
        expect(mockClientKeys.jobs.addLog).toHaveBeenCalled();
        expect(mockCleanupWorkspace).toHaveBeenCalledWith('123');
    });

    it('should handle job execution error', async () => {
        const job = {
            id: 124,
            projectId: 456,
            teamId: 789,
            type: 'run_orchestrator',
            inputs: { command: 'die' }
        };

        mockWorkerStart.mockImplementation(async (processor: any) => {
            await processor(job);
        });

        mockCreateWorkspace.mockResolvedValue('/tmp/job-124');
        mockOrchestrator.mockImplementation(() => ({
            init: mockOrchestratorInit,
            runAIWorkflow: mockRunAIWorkflow,
            // Mock execute to throw
            execute: jest.fn<() => Promise<void>>().mockRejectedValue(new Error('Kaboom'))
        }));

        // We expect start() to reject because processor re-throws
        await expect(factoryWorker.start()).rejects.toThrow('Kaboom');

        expect(mockClientKeys.jobs.addLog).toHaveBeenCalledWith(
            789, 456, 124,
            expect.objectContaining({ level: 'error', message: expect.stringContaining('Kaboom') })
        );
        expect(mockCleanupWorkspace).toHaveBeenCalledWith('124');
    });
});

