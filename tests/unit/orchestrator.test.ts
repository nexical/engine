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
const mockExecutor = jest.fn();
const mockCommandRegistry = jest.fn();
const mockAgentRegistry = jest.fn();
const mockGitService = jest.fn();
const mockFileSystemService = jest.fn();

jest.unstable_mockModule('fs-extra', () => ({ default: mockFs }));
jest.unstable_mockModule('fs/promises', () => mockFsPromises);
jest.unstable_mockModule('../../src/planner.js', () => ({ Planner: mockPlanner }));
jest.unstable_mockModule('../../src/executor.js', () => ({ Executor: mockExecutor }));
jest.unstable_mockModule('../../src/plugins/CommandRegistry.js', () => ({ CommandRegistry: mockCommandRegistry }));
jest.unstable_mockModule('../../src/plugins/AgentRegistry.js', () => ({ AgentRegistry: mockAgentRegistry }));
jest.unstable_mockModule('../../src/services/GitService.js', () => ({ GitService: mockGitService }));
jest.unstable_mockModule('../../src/services/FileSystemService.js', () => ({ FileSystemService: mockFileSystemService }));

const { Orchestrator } = await import('../../src/orchestrator.js');

describe('Orchestrator', () => {
    let orchestrator: OrchestratorType;
    let mockPlannerInstance: any;
    let mockExecutorInstance: any;
    let mockCommandRegistryInstance: any;
    let mockAgentRegistryInstance: any;

    beforeEach(() => {
        mockFs.existsSync.mockReturnValue(false);
        (mockFsPromises.readdir as any).mockResolvedValue([]);

        mockPlannerInstance = { generatePlan: jest.fn() };
        mockExecutorInstance = { executePlan: jest.fn() };
        mockCommandRegistryInstance = { register: jest.fn(), get: jest.fn() };
        mockAgentRegistryInstance = { register: jest.fn(), get: jest.fn() };

        (mockPlanner as any).mockImplementation(() => mockPlannerInstance);
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
            expect(mockPlanner).toHaveBeenCalled();
            expect(mockExecutor).toHaveBeenCalled();
        });

        it('should detect website directory', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.statSync.mockReturnValue({ isDirectory: () => true });

            const orch = new Orchestrator([]);
            expect(orch.config.projectPath).toContain('website');
        });
    });

    describe('init', () => {
        it('should load plugins', async () => {
            mockFs.existsSync.mockReturnValue(true);
            await orchestrator.init();
            expect(mockFsPromises.readdir).toHaveBeenCalledTimes(2); // commands and agents
        });

        it('should load and register valid plugins', async () => {
            mockFs.existsSync.mockReturnValue(true);
            (mockFsPromises.readdir as any).mockImplementation((path: string) => {
                if (path.includes('commands')) return ['HelpCommandPlugin.ts'];
                if (path.includes('agents')) return ['CLIAgentPlugin.ts'];
                return [];
            });

            await orchestrator.init();

            expect(mockCommandRegistryInstance.register).toHaveBeenCalled();
            expect(mockAgentRegistryInstance.register).toHaveBeenCalled();
        });

        it('should handle plugin loading errors', async () => {
            mockFs.existsSync.mockReturnValue(true);
            (mockFsPromises.readdir as any).mockImplementation((path: string) => {
                if (path.includes('commands')) return ['BadCommandPlugin.ts'];
                if (path.includes('agents')) return ['BadAgentPlugin.ts'];
                return [];
            });

            // We expect import() to fail because the files don't exist
            // and we haven't mocked them.
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

            await orchestrator.init();

            expect(consoleSpy).toHaveBeenNthCalledWith(1, expect.stringContaining('Failed to load command plugin'), expect.anything());
            expect(consoleSpy).toHaveBeenNthCalledWith(2, expect.stringContaining('Failed to load agent plugin'), expect.anything());

            consoleSpy.mockRestore();
        });

        it('should ignore missing plugin directories', async () => {
            mockFsPromises.readdir.mockClear();
            mockFs.existsSync.mockReturnValue(false);
            await orchestrator.init();
            expect(mockFsPromises.readdir).not.toHaveBeenCalled();
        });

        it('should ignore non-plugin files', async () => {
            mockFs.existsSync.mockReturnValue(true);
            (mockFsPromises.readdir as any).mockResolvedValue(['readme.txt', 'types.d.ts']);

            await orchestrator.init();

            expect(mockCommandRegistryInstance.register).not.toHaveBeenCalled();
            expect(mockAgentRegistryInstance.register).not.toHaveBeenCalled();
        });

        it('should ignore invalid plugins', async () => {
            const realFs = jest.requireActual('fs') as any;
            const path = jest.requireActual('path') as any;
            const os = jest.requireActual('os') as any;

            const tempDir = realFs.mkdtempSync(path.join(os.tmpdir(), 'plotris-test-'));
            const commandsDir = path.join(tempDir, 'plugins', 'commands');
            realFs.mkdirSync(commandsDir, { recursive: true });
            const agentsDir = path.join(tempDir, 'plugins', 'agents');
            realFs.mkdirSync(agentsDir, { recursive: true });

            // 1. Not a function export (using CJS to avoid Jest parsing issues with ESM in VM)
            realFs.writeFileSync(path.join(commandsDir, 'NotAFunction.js'), 'module.exports = "bar";');
            realFs.writeFileSync(path.join(agentsDir, 'NotAFunction.js'), 'module.exports = "bar";');

            // 2. Not a plugin instance (valid class but fails isCommandPlugin/isAgentPlugin check)
            realFs.writeFileSync(path.join(commandsDir, 'NotAPlugin.js'), 'class Bar {}; module.exports = Bar;');
            realFs.writeFileSync(path.join(agentsDir, 'NotAPlugin.js'), 'class Bar {}; module.exports = Bar;');

            // 3. Valid class structure but missing required properties (to test isCommandPlugin returning false)
            realFs.writeFileSync(path.join(commandsDir, 'InvalidCommand.js'), 'class InvalidCommand { constructor(o) {} }; module.exports = InvalidCommand;');
            realFs.writeFileSync(path.join(agentsDir, 'InvalidAgent.js'), 'class InvalidAgent { constructor(o) {} }; module.exports = InvalidAgent;');

            orchestrator.config.appPath = tempDir;

            mockFs.existsSync.mockReturnValue(true);
            (mockFsPromises.readdir as any).mockImplementation((dir: string) => {
                console.log(`Mock readdir called with: ${dir}`);
                console.log(`Expecting commandsDir: ${commandsDir}`);
                console.log(`Expecting agentsDir: ${agentsDir}`);
                if (dir === commandsDir) return ['NotAFunction.js', 'NotAPlugin.js', 'InvalidCommand.js'];
                if (dir === agentsDir) return ['NotAFunction.js', 'NotAPlugin.js', 'InvalidAgent.js'];
                return [];
            });

            await orchestrator.init();

            expect(mockCommandRegistryInstance.register).not.toHaveBeenCalled();

            // Cleanup
            realFs.rmSync(tempDir, { recursive: true, force: true });
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
