import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import type { Orchestrator as OrchestratorType } from '../../src/orchestrator.js';

const mockFs = {
    existsSync: jest.fn(),
    statSync: jest.fn(),
};

const mockFsPromises = {
    readdir: jest.fn(),
};

const mockPlanner = jest.fn();
const mockArchitect = jest.fn();
const mockExecutor = jest.fn();
const mockCommandRegistry = jest.fn();
const mockAgentRegistry = jest.fn();
const mockGitService = jest.fn();
const mockFileSystemService = jest.fn();

jest.unstable_mockModule('fs-extra', () => ({ default: mockFs }));
jest.unstable_mockModule('fs/promises', () => mockFsPromises);
jest.unstable_mockModule('../../src/planner.js', () => ({ Planner: mockPlanner }));
jest.unstable_mockModule('../../src/architect.js', () => ({ Architect: mockArchitect }));
jest.unstable_mockModule('../../src/executor.js', () => ({ Executor: mockExecutor }));
jest.unstable_mockModule('../../src/plugins/CommandRegistry.js', () => ({ CommandRegistry: mockCommandRegistry }));
jest.unstable_mockModule('../../src/plugins/AgentRegistry.js', () => ({ AgentRegistry: mockAgentRegistry }));
jest.unstable_mockModule('../../src/services/GitService.js', () => ({ GitService: mockGitService }));
jest.unstable_mockModule('../../src/services/FileSystemService.js', () => ({ FileSystemService: mockFileSystemService }));

const { Orchestrator } = await import('../../src/orchestrator.js');

describe('Orchestrator', () => {
    let orchestrator: OrchestratorType;
    let mockPlannerInstance: any;
    let mockArchitectInstance: any;
    let mockExecutorInstance: any;
    let mockCommandRegistryInstance: any;
    let mockAgentRegistryInstance: any;

    beforeEach(() => {
        mockFs.existsSync.mockReturnValue(false);
        (mockFsPromises.readdir as any).mockResolvedValue([]);

        mockPlannerInstance = { generatePlan: jest.fn() };
        mockArchitectInstance = { generateArchitecture: jest.fn() };
        mockExecutorInstance = { executePlan: jest.fn() };
        mockCommandRegistryInstance = { register: jest.fn(), get: jest.fn(), load: jest.fn() };
        mockAgentRegistryInstance = { register: jest.fn(), get: jest.fn(), load: jest.fn() };

        (mockPlanner as any).mockImplementation(() => mockPlannerInstance);
        (mockArchitect as any).mockImplementation(() => mockArchitectInstance);
        (mockExecutor as any).mockImplementation(() => mockExecutorInstance);
        (mockCommandRegistry as any).mockImplementation(() => mockCommandRegistryInstance);
        (mockAgentRegistry as any).mockImplementation(() => mockAgentRegistryInstance);
        (mockGitService as any).mockImplementation(() => ({}));
        (mockFileSystemService as any).mockImplementation(() => ({}));

        orchestrator = new Orchestrator([]);
    });

    describe('constructor', () => {
        it('should initialize with default paths', () => {
            expect(orchestrator.config.projectPath).toBe(process.cwd());
            expect(mockCommandRegistry).toHaveBeenCalled();
            expect(mockAgentRegistry).toHaveBeenCalled();
            expect(mockFileSystemService).toHaveBeenCalled();
            expect(mockGitService).toHaveBeenCalled();
            expect(mockGitService).toHaveBeenCalled();
            expect(mockPlanner).toHaveBeenCalled();
            expect(mockArchitect).toHaveBeenCalled();
            expect(mockExecutor).toHaveBeenCalled();
        });

        it('should detect website directory', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.statSync.mockReturnValue({ isDirectory: () => true });

            const orch = new Orchestrator([]);
            expect(orch.config.projectPath).toContain('dev_project');
        });
    });

    describe('init', () => {
        it('should load plugins', async () => {
            mockFs.existsSync.mockReturnValue(true);
            await orchestrator.init();

            expect(mockCommandRegistryInstance.load).toHaveBeenCalledWith(expect.stringContaining('plugins/commands'));
            expect(mockAgentRegistryInstance.load).toHaveBeenCalledWith(expect.stringContaining('plugins/agents'));
        });
    });

    describe('execute', () => {
        it('should execute a command', async () => {
            const mockCommand = { execute: jest.fn() };
            mockCommandRegistryInstance.get.mockReturnValue(mockCommand);

            await orchestrator.execute('/test arg1');

            expect(mockCommandRegistryInstance.get).toHaveBeenCalledWith('test');
            expect(mockCommand.execute).toHaveBeenCalledWith(['arg1']);
        });

        it('should log error for unknown command', async () => {
            mockCommandRegistryInstance.get.mockReturnValue(undefined);
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

            await orchestrator.execute('/unknown');

            expect(consoleSpy).toHaveBeenCalledWith('Unknown command: /unknown');
            consoleSpy.mockRestore();
        });

        it('should run AI workflow for non-command input', async () => {
            await orchestrator.execute('do something');

            expect(mockPlannerInstance.generatePlan).toHaveBeenCalledWith('do something');
            expect(mockExecutorInstance.executePlan).toHaveBeenCalled();
        });
    });

    describe('runAIWorkflow', () => {
        it('should generate and execute plan', async () => {
            const plan = { tasks: [] };
            mockPlannerInstance.generatePlan.mockResolvedValue(plan);

            await orchestrator.runAIWorkflow('prompt');

            expect(mockArchitectInstance.generateArchitecture).toHaveBeenCalledWith('prompt');
            expect(mockPlannerInstance.generatePlan).toHaveBeenCalledWith('prompt');
            expect(mockExecutorInstance.executePlan).toHaveBeenCalledWith(plan, 'prompt');
        });

        it('should handle errors', async () => {
            mockPlannerInstance.generatePlan.mockRejectedValue(new Error('Plan failed'));
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

            await orchestrator.runAIWorkflow('prompt');

            expect(consoleSpy).toHaveBeenCalledWith('AI workflow failed:', expect.any(Error));
            consoleSpy.mockRestore();
        });
    });
});
