import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import type { Orchestrator as OrchestratorType } from '../../src/orchestrator.js';
import yaml from 'js-yaml';

const mockFs = {
    existsSync: jest.fn(),
    statSync: jest.fn(),
    ensureDirSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    appendFileSync: jest.fn(),
    readdirSync: jest.fn(),
    moveSync: jest.fn(),
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
const mockFileSystemService = {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    appendFile: jest.fn(),
    move: jest.fn(),
    ensureDir: jest.fn(),
    exists: jest.fn(),
    isDirectory: jest.fn(),
    listFiles: jest.fn(),
};
const MockFileSystemServiceConstructor = jest.fn(() => mockFileSystemService);

jest.unstable_mockModule('fs-extra', () => ({ default: mockFs }));
jest.unstable_mockModule('fs/promises', () => mockFsPromises);
jest.unstable_mockModule('../../src/workflow/planner.js', () => ({ Planner: mockPlanner }));
jest.unstable_mockModule('../../src/workflow/architect.js', () => ({ Architect: mockArchitect }));
jest.unstable_mockModule('../../src/workflow/executor.js', () => ({ Executor: mockExecutor }));
jest.unstable_mockModule('../../src/plugins/CommandRegistry.js', () => ({ CommandRegistry: mockCommandRegistry }));
jest.unstable_mockModule('../../src/plugins/AgentRegistry.js', () => ({ AgentRegistry: mockAgentRegistry }));
jest.unstable_mockModule('../../src/services/GitService.js', () => ({ GitService: mockGitService }));
jest.unstable_mockModule('../../src/services/FileSystemService.js', () => ({ FileSystemService: MockFileSystemServiceConstructor }));

const { Orchestrator } = await import('../../src/orchestrator.js');

describe('Orchestrator', () => {
    let orchestrator: OrchestratorType;
    let mockPlannerInstance: any;
    let mockArchitectInstance: any;
    let mockExecutorInstance: any;
    let mockCommandRegistryInstance: any;
    let mockAgentRegistryInstance: any;

    beforeEach(async () => {
        jest.resetModules();
        mockFileSystemService.exists.mockReturnValue(false);
        mockFileSystemService.readFile.mockReturnValue('');
        mockFileSystemService.listFiles.mockReturnValue([]);
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
        // FileSystemService mock is already set up via the constructor mock

        orchestrator = new Orchestrator([]);
    });

    describe('constructor', () => {
        it('should initialize with default paths', () => {
            expect(orchestrator.config.projectPath).toBe(process.cwd());
            expect(mockCommandRegistry).toHaveBeenCalled();
            expect(mockAgentRegistry).toHaveBeenCalled();
            expect(MockFileSystemServiceConstructor).toHaveBeenCalled();
            expect(mockGitService).toHaveBeenCalled();
            expect(mockGitService).toHaveBeenCalled();
            expect(mockPlanner).toHaveBeenCalled();
            expect(mockArchitect).toHaveBeenCalled();
            expect(mockExecutor).toHaveBeenCalled();
        });

        it('should detect website directory', () => {
            mockFileSystemService.exists.mockReturnValue(true);
            mockFileSystemService.isDirectory.mockReturnValue(true);

            const orch = new Orchestrator([]);
            expect(orch.config.projectPath).toContain('dev_project');
        });
    });

    describe('init', () => {
        it('should load plugins', async () => {
            mockFileSystemService.exists.mockReturnValue(true);
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
            const plan = { plan_name: 'test', tasks: [] };
            mockPlannerInstance.generatePlan.mockResolvedValue(plan);
            mockFileSystemService.readFile.mockReturnValue('tasks: []');
            await orchestrator.execute('do something');

            expect(mockPlannerInstance.generatePlan).toHaveBeenCalledWith('do something', undefined, []);
            expect(mockExecutorInstance.executePlan).toHaveBeenCalled();
        });
    });

    describe('runAIWorkflow', () => {
        it('should generate and execute plan', async () => {
            const plan = { tasks: [] };
            mockPlannerInstance.generatePlan.mockResolvedValue(plan);
            mockFileSystemService.readFile.mockReturnValue('tasks: []'); // Mock plan file content

            await orchestrator.runAIWorkflow('prompt');

            expect(mockArchitectInstance.generateArchitecture).toHaveBeenCalledWith('prompt');
            expect(mockPlannerInstance.generatePlan).toHaveBeenCalledWith('prompt', undefined, []);
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

    describe('state initialization', () => {
        it('should initialize new state if file does not exist', async () => {
            mockFileSystemService.exists.mockReturnValue(false);
            mockPlannerInstance.generatePlan.mockResolvedValue({ plan_name: 'test', tasks: [] });
            mockFileSystemService.readFile.mockReturnValue('tasks: []'); // For EXECUTING state

            // Trigger state load via runAIWorkflow
            await orchestrator.runAIWorkflow('prompt');

            // Verify initial state save
            expect(mockFileSystemService.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('state.yml'),
                expect.stringContaining('status: ARCHITECTING')
            );
        });

        it('should load existing state if file exists', async () => {
            mockFileSystemService.exists.mockReturnValue(true);
            mockFileSystemService.readFile.mockReturnValue(yaml.dump({
                session_id: 'existing-session',
                status: 'IDLE',
                loop_count: 0,
                tasks: { completed: [], failed: [], pending: [] }
            }));

            // Trigger state load via runAIWorkflow
            // We need to mock runLoop to avoid execution
            const originalRunLoop = (orchestrator as any).runLoop;
            (orchestrator as any).runLoop = jest.fn();

            await orchestrator.runAIWorkflow('prompt');

            expect(mockFileSystemService.readFile).toHaveBeenCalledWith(expect.stringContaining('state.yml'));
            expect((orchestrator as any).state.session_id).toBe('existing-session');

            // Restore runLoop
            (orchestrator as any).runLoop = originalRunLoop;
        });
    });
});
