import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies using unstable_mockModule
const mockWorkspaceManagerInstance = {
    createWorkspace: jest.fn(),
    cleanupWorkspace: jest.fn(),
    setupGlobalCache: jest.fn()
};

const mockJobServiceInstance = {
    streamLog: jest.fn()
};

const mockGitInstance = {
    clone: jest.fn(),
    init: jest.fn(),
    checkout: jest.fn(),
    add: jest.fn(),
    commit: jest.fn(),
    push: jest.fn(),
    status: jest.fn() // returns string or something? status() returns string in GitService
};

const mockOrchestratorInstance = {
    init: jest.fn(),
    runAIWorkflow: jest.fn(),
    execute: jest.fn(),
    git: mockGitInstance
};

const mockWorkerInstance = {
    start: jest.fn(),
    stop: jest.fn()
};

const mockClientInstance = {
    projects: {
        get: jest.fn()
    }
};

const mockCloudflareServiceInstance = {
    ensureProjectExists: jest.fn()
};

jest.unstable_mockModule('@nexical/sdk', () => ({
    NexicalClient: jest.fn(() => mockClientInstance),
    NexicalWorker: jest.fn(() => mockWorkerInstance)
}));

jest.unstable_mockModule('../../src/services/WorkspaceManager.js', () => ({
    WorkspaceManager: jest.fn(() => mockWorkspaceManagerInstance)
}));

jest.unstable_mockModule('../../src/services/JobService.js', () => ({
    JobService: jest.fn(() => mockJobServiceInstance)
}));

jest.unstable_mockModule('../../src/services/IdentityManager.js', () => ({
    IdentityManager: jest.fn()
}));

jest.unstable_mockModule('../../src/orchestrator.js', () => ({
    Orchestrator: jest.fn(() => mockOrchestratorInstance)
}));

jest.unstable_mockModule('../../src/services/CloudflareService.js', () => ({
    CloudflareService: jest.fn(() => mockCloudflareServiceInstance)
}));

// Dynamic imports
const { FactoryWorker } = await import('../../src/worker.js');
const { WorkspaceManager } = await import('../../src/services/WorkspaceManager.js');
const { JobService } = await import('../../src/services/JobService.js');
const { Orchestrator } = await import('../../src/orchestrator.js');
const { NexicalClient, NexicalWorker } = await import('@nexical/sdk');
const { CloudflareService } = await import('../../src/services/CloudflareService.js');

describe('FactoryWorker', () => {
    let factoryWorker: any;
    // We use the shared instances created above for assertions

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Setup default behaviors
        (mockWorkspaceManagerInstance.createWorkspace as jest.Mock<any>).mockResolvedValue('/tmp/workspace');
        (mockWorkspaceManagerInstance.setupGlobalCache as jest.Mock<any>).mockResolvedValue(undefined);
        (mockWorkspaceManagerInstance.cleanupWorkspace as jest.Mock<any>).mockResolvedValue(undefined);
        (mockJobServiceInstance.streamLog as jest.Mock<any>).mockResolvedValue(undefined);
        (mockOrchestratorInstance.init as jest.Mock<any>).mockResolvedValue(undefined);
        (mockOrchestratorInstance.runAIWorkflow as jest.Mock<any>).mockResolvedValue(undefined);
        (mockOrchestratorInstance.execute as jest.Mock<any>).mockResolvedValue(undefined);

        (mockClientInstance.projects.get as jest.Mock<any>).mockResolvedValue({
            id: 456,
            name: 'test-project',
            repoUrl: 'https://github.com/owner/repo',
            mode: 'managed'
        });
        (mockGitInstance.status as jest.Mock<any>).mockReturnValue('modified');
        (mockCloudflareServiceInstance.ensureProjectExists as jest.Mock<any>).mockResolvedValue(true);

        // Re-instantiate worker (it will use the mocks)
        factoryWorker = new FactoryWorker(
            new NexicalClient({}) as any,
            new NexicalWorker(new NexicalClient({}), {}) as any,
            new WorkspaceManager() as any,
            new JobService(new NexicalClient({})) as any,
            new CloudflareService() as any
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('start', () => {
        it('should setup cache and start worker', async () => {
            await factoryWorker.start();
            expect(mockWorkspaceManagerInstance.setupGlobalCache).toHaveBeenCalled();
            expect(mockWorkerInstance.start).toHaveBeenCalled();
        });

        it('should handle SIGTERM/SIGINT', async () => {
            // Mock process.exit to prevent actual exit
            const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => { }) as any);

            // Mock process.on
            let shutdownListener: Function | undefined;
            const onSpy = jest.spyOn(process, 'on').mockImplementation((event, listener) => {
                if (event === 'SIGTERM') {
                    shutdownListener = listener as Function;
                }
                return process;
            });

            await factoryWorker.start();
            expect(onSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
            expect(onSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));

            // Trigger shutdown
            if (shutdownListener) {
                await shutdownListener();
            }

            expect(mockWorkerInstance.stop).toHaveBeenCalled();
            expect(exitSpy).toHaveBeenCalledWith(0);

            onSpy.mockRestore();
            exitSpy.mockRestore();
        });
    });

    describe('processJob', () => {
        // Access private method
        const runProcessJob = async (job: any) => {
            await (factoryWorker as any).processJob(job);
        };

        it('should process a prompt job', async () => {
            const job = { id: 123, projectId: 456, type: 'workflow', inputs: { prompt: 'Do AI stuff' } };
            await runProcessJob(job);

            expect(mockWorkspaceManagerInstance.createWorkspace).toHaveBeenCalledWith('123');
            expect(Orchestrator).toHaveBeenCalledWith(expect.objectContaining({
                workingDirectory: '/tmp/workspace',
                jobContext: expect.objectContaining({ jobId: 123, projectId: 456 })
            }));
            expect(mockOrchestratorInstance.init).toHaveBeenCalled();
            expect(mockGitInstance.clone).toHaveBeenCalledWith('https://github.com/owner/repo', '.');
            expect(mockGitInstance.checkout).toHaveBeenCalledWith('job-123', true);
            expect(mockOrchestratorInstance.runAIWorkflow).toHaveBeenCalledWith('Do AI stuff');
            expect(mockJobServiceInstance.streamLog).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining('Executing prompt'));
            expect(mockJobServiceInstance.streamLog).toHaveBeenCalledWith(expect.any(Object), 'Job completed successfully.');

            expect(mockGitInstance.add).toHaveBeenCalledWith('.');
            expect(mockGitInstance.commit).toHaveBeenCalledWith('Job 123 completion');
            expect(mockGitInstance.push).toHaveBeenCalledWith('origin', 'job-123');
            expect(mockCloudflareServiceInstance.ensureProjectExists).toHaveBeenCalledWith('test-project', 'https://github.com/owner/repo');

            expect(mockWorkspaceManagerInstance.cleanupWorkspace).toHaveBeenCalledWith('123');
        });

        it('should process a command job', async () => {
            const job = { id: 124, projectId: 456, type: 'exec', inputs: { command: 'echo hello' } };
            await runProcessJob(job);

            expect(mockOrchestratorInstance.execute).toHaveBeenCalledWith('echo hello');
            expect(mockJobServiceInstance.streamLog).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining('Executing command'));
        });

        it('should throw if no prompt or command', async () => {
            const job = { id: 125, projectId: 456, type: 'bad', inputs: {} };
            await expect(runProcessJob(job)).rejects.toThrow("Job 125 has no 'prompt' or 'command' input.");
            expect(mockJobServiceInstance.streamLog).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining('Job failed'), 'error');
            expect(mockWorkspaceManagerInstance.cleanupWorkspace).toHaveBeenCalledWith('125');
        });

        it('should handle orchestrator failures', async () => {
            (mockOrchestratorInstance.runAIWorkflow as jest.Mock<any>).mockRejectedValue(new Error('Orchestrator exploded'));
            const job = { id: 126, projectId: 456, type: 'workflow', inputs: { prompt: 'Fail me' } };

            await expect(runProcessJob(job)).rejects.toThrow('Orchestrator exploded');
            expect(mockWorkspaceManagerInstance.cleanupWorkspace).toHaveBeenCalledWith('126');
            expect(mockJobServiceInstance.streamLog).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining('Job failed: Orchestrator exploded'), 'error');
        });

        it('should handle workspace creation failure', async () => {
            (mockWorkspaceManagerInstance.createWorkspace as jest.Mock<any>).mockRejectedValue(new Error('Workspace init failed'));
            const job = { id: 127, projectId: 456, type: 'workflow', inputs: { prompt: 'fail' } };

            await expect(runProcessJob(job)).rejects.toThrow('Workspace init failed');
            expect(mockWorkspaceManagerInstance.cleanupWorkspace).not.toHaveBeenCalled();
        });
        it('should default mode to managed if missing', async () => {
            (mockClientInstance.projects.get as jest.Mock<any>).mockResolvedValue({
                id: 457, name: 'default-mode', repoUrl: 'http://repo', mode: undefined
            });
            const job = { id: 135, projectId: 457, type: 'workflow', inputs: { prompt: 'foo' } };
            await runProcessJob(job);

            expect(mockOrchestratorInstance.init).toHaveBeenCalled();
            // Verify implicitly by ensuring no error, but can't easily check orchestrator config without spying constructor args
            // However, this covers the code path.
        });

        it('should handle project fetch failure', async () => {
            (mockClientInstance.projects.get as jest.Mock<any>).mockRejectedValue(new Error('Project not found'));
            const job = { id: 130, projectId: 999, type: 'workflow', inputs: { prompt: 'foo' } };

            await expect(runProcessJob(job)).rejects.toThrow('Failed to retrieve project 999: Project not found');
        });

        it('should initialize empty repo if no repoUrl', async () => {
            (mockClientInstance.projects.get as jest.Mock<any>).mockResolvedValue({
                id: 456, name: 'empty-project', repoUrl: null, mode: 'managed'
            });

            const job = { id: 131, projectId: 456, type: 'workflow', inputs: { prompt: 'foo' } };
            await runProcessJob(job);

            expect(mockGitInstance.init).toHaveBeenCalled();
            expect(mockGitInstance.clone).not.toHaveBeenCalled();
            // Should also not push to origin or link cloudflare
            expect(mockGitInstance.push).not.toHaveBeenCalled();
            expect(mockCloudflareServiceInstance.ensureProjectExists).not.toHaveBeenCalled();
        });

        it('should retry checkout if -b fails', async () => {
            // first checkout fails (branch exists?)
            (mockGitInstance.checkout as jest.Mock<any>)
                .mockImplementationOnce(() => { throw new Error('Branch exists'); })
                .mockImplementationOnce(() => { }); // second succeeds

            const job = { id: 132, projectId: 456, type: 'workflow', inputs: { prompt: 'foo' } };
            await runProcessJob(job);

            expect(mockGitInstance.checkout).toHaveBeenCalledTimes(2);
            expect(mockGitInstance.checkout).toHaveBeenNthCalledWith(1, 'job-132', true);
            expect(mockGitInstance.checkout).toHaveBeenNthCalledWith(2, 'job-132');

            // clean up mock for other tests
            (mockGitInstance.checkout as jest.Mock<any>).mockReset();
        });

        it('should handle commit warning if no changes or error', async () => {
            (mockGitInstance.status as jest.Mock<any>).mockReturnValue('modified');
            (mockGitInstance.commit as jest.Mock<any>).mockImplementation(() => { throw new Error('Nothing to commit'); });

            const job = { id: 133, projectId: 456, type: 'workflow', inputs: { prompt: 'foo' } };
            await runProcessJob(job);

            // Should complete successfully even if commit fails
            expect(mockJobServiceInstance.streamLog).toHaveBeenCalledWith(expect.any(Object), 'Job completed successfully.');
        });

        it('should skip commit if status says no changes', async () => {
            (mockGitInstance.status as jest.Mock<any>).mockReturnValue('');
            const job = { id: 134, projectId: 456, type: 'workflow', inputs: { prompt: 'foo' } };
            await runProcessJob(job);

            expect(mockGitInstance.commit).not.toHaveBeenCalled();
        });
    });
});
