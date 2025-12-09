import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import type { Orchestrator as OrchestratorType } from '../../src/orchestrator.js';
import { SignalDetectedError } from '../../src/errors/SignalDetectedError.js';
import { Signal } from '../../src/models/State.js';
import yaml from 'js-yaml';

const mockFs = {
    // Keep minimal mocks for fs-extra if needed by other modules, or just empty
    existsSync: jest.fn(),
    statSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    appendFileSync: jest.fn(),
    readdirSync: jest.fn(),
    moveSync: jest.fn(),
    ensureDirSync: jest.fn(),
};

const mockPlanner = jest.fn();
const mockArchitect = jest.fn();
const mockExecutor = jest.fn();
const mockCommandRegistry = jest.fn();
const mockSkillRegistry = jest.fn();
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
    writeFileAtomic: jest.fn(),
};
const MockFileSystemServiceConstructor = jest.fn(() => {
    console.log('MockFileSystemServiceConstructor called');
    return mockFileSystemService;
});

jest.unstable_mockModule('fs-extra', () => ({ default: mockFs }));
jest.unstable_mockModule('../../src/workflow/planner.js', () => ({ Planner: mockPlanner }));
jest.unstable_mockModule('../../src/workflow/architect.js', () => ({ Architect: mockArchitect }));
jest.unstable_mockModule('../../src/workflow/executor.js', () => ({ Executor: mockExecutor }));
jest.unstable_mockModule('../../src/services/CommandRegistry.js', () => ({ CommandRegistry: mockCommandRegistry }));
jest.unstable_mockModule('../../src/services/SkillRegistry.js', () => ({ SkillRegistry: mockSkillRegistry }));
jest.unstable_mockModule('../../src/services/GitService.js', () => ({ GitService: mockGitService }));
jest.unstable_mockModule('../../src/services/FileSystemService.js', () => ({ FileSystemService: MockFileSystemServiceConstructor }));

// Remove top-level import
// const { Orchestrator } = await import('../../src/orchestrator.js');

describe('Orchestrator Loop', () => {
    let orchestrator: OrchestratorType;
    let SignalDetectedErrorClass: typeof SignalDetectedError;
    let mockPlannerInstance: any;
    let mockArchitectInstance: any;
    let mockExecutorInstance: any;

    beforeEach(async () => {
        jest.resetModules();
        jest.clearAllMocks();
        mockFileSystemService.exists.mockReturnValue(false);
        mockFileSystemService.readFile.mockReturnValue('');
        mockFileSystemService.listFiles.mockReturnValue([]);

        const errorModule = await import('../../src/errors/SignalDetectedError.js');
        SignalDetectedErrorClass = errorModule.SignalDetectedError;

        mockPlannerInstance = { generatePlan: jest.fn() };
        mockArchitectInstance = { generateArchitecture: jest.fn() };
        mockExecutorInstance = { executePlan: jest.fn() };

        (mockPlanner as any).mockImplementation(() => mockPlannerInstance);
        (mockArchitect as any).mockImplementation(() => mockArchitectInstance);
        (mockExecutor as any).mockImplementation(() => mockExecutorInstance);
        (mockCommandRegistry as any).mockImplementation(() => ({ load: jest.fn() }));
        (mockSkillRegistry as any).mockImplementation(() => ({ load: jest.fn() }));
        (mockGitService as any).mockImplementation(() => ({}));
        // FileSystemService mock is already set up via the constructor mock

        const { Orchestrator } = await import('../../src/orchestrator.js');
        orchestrator = new Orchestrator({ workingDirectory: '/test/project' });
    });

    it('should run full successful workflow', async () => {
        // Mock state transitions
        // Initial state: IDLE -> ARCHITECTING
        // Loop 1: ARCHITECTING -> PLANNING
        // Loop 2: PLANNING -> EXECUTING
        // Loop 3: EXECUTING -> COMPLETED

        const plan = { plan_name: 'test-plan', tasks: [] };
        mockPlannerInstance.generatePlan.mockResolvedValue(plan);
        mockFileSystemService.readFile.mockReturnValue(yaml.dump(plan)); // For reading plan file in EXECUTING state

        await orchestrator.runAIWorkflow('test prompt');

        expect(mockArchitectInstance.generateArchitecture).toHaveBeenCalled();
        expect(mockPlannerInstance.generatePlan).toHaveBeenCalled();
        expect(mockExecutorInstance.executePlan).toHaveBeenCalled();
        expect(mockFileSystemService.writeFileAtomic).toHaveBeenCalled(); // State updates
    });

    it('should handle REPLAN signal', async () => {
        // Mock Executor throwing SignalDetectedError
        const signal: Signal = { type: 'REPLAN', source: 'agent', reason: 'error', timestamp: 'now' };
        mockExecutorInstance.executePlan.mockRejectedValueOnce(new SignalDetectedErrorClass(signal));

        // Mock signal files for archiving
        mockFileSystemService.listFiles.mockReturnValue(['signal.md']);
        mockFileSystemService.exists.mockReturnValue(true);

        // Mock subsequent success
        mockExecutorInstance.executePlan.mockResolvedValueOnce(undefined);

        const plan = { plan_name: 'test-plan', tasks: [] };
        mockPlannerInstance.generatePlan.mockResolvedValue(plan);
        mockFileSystemService.readFile.mockReturnValue(yaml.dump(plan));

        await orchestrator.runAIWorkflow('test prompt');

        // Should have called executePlan twice
        expect(mockExecutorInstance.executePlan).toHaveBeenCalledTimes(2);
        // Should have appended to log
        // Should have appended to log
        expect(mockFileSystemService.appendFile).toHaveBeenCalledWith(expect.stringContaining('log.md'), expect.any(String));
    });

    it('should handle REARCHITECT signal', async () => {
        // Mock Executor throwing SignalDetectedError
        const signal: Signal = { type: 'REARCHITECT', source: 'agent', reason: 'bad design', timestamp: 'now' };
        mockExecutorInstance.executePlan.mockRejectedValueOnce(new SignalDetectedErrorClass(signal));

        // Mock signal files for archiving (to cover archiveSignal)
        mockFileSystemService.listFiles.mockReturnValue(['signal.md']);
        mockFileSystemService.exists.mockReturnValue(true);

        // Mock subsequent success
        mockExecutorInstance.executePlan.mockResolvedValueOnce(undefined);

        const plan = { plan_name: 'test-plan', tasks: [] };
        mockPlannerInstance.generatePlan.mockResolvedValue(plan);
        mockFileSystemService.readFile.mockReturnValue(yaml.dump(plan));

        await orchestrator.runAIWorkflow('test prompt');

        // Should have called generateArchitecture twice (initial + rearchitect)
        expect(mockArchitectInstance.generateArchitecture).toHaveBeenCalledTimes(2);
    });

    it('should stop after MAX_LOOPS', async () => {
        // Mock state to be near max loops
        mockFileSystemService.exists.mockReturnValue(true);

        // Mock loadState to set the state directly
        (orchestrator as any).loadState = jest.fn(() => {
            (orchestrator as any).state = {
                session_id: 'test-session',
                status: 'PLANNING',
                loop_count: 6,
                tasks: { completed: [], failed: [], pending: [] }
            };
        });

        await orchestrator.runAIWorkflow('test prompt');

        expect(mockFileSystemService.writeFileAtomic).toHaveBeenCalledWith(
            expect.stringContaining('state.yml'),
            expect.stringContaining('status: FAILED')
        );
    });

    it('should resume INTERRUPTED session', async () => {
        mockFileSystemService.exists.mockReturnValue(true);

        // Mock loadState to set the state directly
        (orchestrator as any).loadState = jest.fn(() => {
            (orchestrator as any).state = {
                session_id: 'test-session',
                status: 'INTERRUPTED',
                loop_count: 1,
                tasks: { completed: [], failed: [], pending: [] }
            };
        });

        // Mock executePlan to succeed to break the loop
        const plan = { plan_name: 'test-plan', tasks: [] };
        mockPlannerInstance.generatePlan.mockResolvedValue(plan);
        mockFileSystemService.readFile.mockReturnValue(yaml.dump(plan));

        mockFileSystemService.exists.mockImplementation(() => true);
        mockFs.existsSync.mockReturnValue(true); // Fallback

        await orchestrator.runAIWorkflow('test prompt');

        // Should not reset to ARCHITECTING
        expect(mockFileSystemService.writeFileAtomic).not.toHaveBeenCalledWith(
            expect.stringContaining('state.yml'),
            expect.stringContaining('status: ARCHITECTING')
        );
    });

    it('should handle REARCHITECT signal with invalidation', async () => {
        const signal: Signal = {
            type: 'REARCHITECT',
            source: 'agent',
            reason: 'bad design',
            timestamp: 'now',
            invalidates_previous_work: true
        };
        mockExecutorInstance.executePlan.mockRejectedValueOnce(new SignalDetectedErrorClass(signal));
        mockExecutorInstance.executePlan.mockResolvedValueOnce(undefined);

        const plan = { plan_name: 'test-plan', tasks: [] };
        mockPlannerInstance.generatePlan.mockResolvedValue(plan);
        mockFileSystemService.readFile.mockReturnValue(yaml.dump(plan));

        await orchestrator.runAIWorkflow('test prompt');

        // Should have cleared completed tasks (verified by state save)
        expect(mockFileSystemService.writeFileAtomic).toHaveBeenCalledWith(
            expect.stringContaining('state.yml'),
            expect.stringContaining('completed: []')
        );
    });

    it('should handle unexpected error in loop', async () => {
        mockArchitectInstance.generateArchitecture.mockRejectedValue(new Error('Unexpected error'));

        await expect(orchestrator.runAIWorkflow('test prompt')).resolves.not.toThrow(); // It catches and logs

        expect(mockFileSystemService.writeFileAtomic).toHaveBeenCalledWith(
            expect.stringContaining('state.yml'),
            expect.stringContaining('status: FAILED')
        );
        expect(mockFileSystemService.writeFileAtomic).toHaveBeenCalledWith(
            expect.stringContaining('state.yml'),
            expect.stringContaining('status: FAILED')
        );
    });

    it('should handle unknown signal', async () => {
        const signal: Signal = { type: 'UNKNOWN_SIGNAL' as any, source: 'agent', reason: 'test', timestamp: 'now' };
        mockExecutorInstance.executePlan.mockRejectedValueOnce(new SignalDetectedErrorClass(signal));
        mockExecutorInstance.executePlan.mockResolvedValueOnce(undefined);

        const plan = { plan_name: 'test-plan', tasks: [] };
        mockPlannerInstance.generatePlan.mockResolvedValue(plan);
        mockFileSystemService.readFile.mockReturnValue(yaml.dump(plan));

        await orchestrator.runAIWorkflow('test prompt');

        expect(mockFileSystemService.writeFileAtomic).toHaveBeenCalledWith(
            expect.stringContaining('state.yml'),
            expect.stringContaining('status: INTERRUPTED')
        );
    });

    it('should handle missing signal file during archiving', async () => {
        const signal: Signal = { type: 'REPLAN', source: 'agent', reason: 'error', timestamp: 'now' };
        mockExecutorInstance.executePlan.mockRejectedValueOnce(new SignalDetectedErrorClass(signal));
        mockExecutorInstance.executePlan.mockResolvedValueOnce(undefined);

        mockFileSystemService.listFiles.mockReturnValue(['missing_signal.md']);
        mockFileSystemService.exists.mockReturnValue(false); // File missing when checking

        const plan = { plan_name: 'test-plan', tasks: [] };
        mockPlannerInstance.generatePlan.mockResolvedValue(plan);
        mockFileSystemService.readFile.mockReturnValue(yaml.dump(plan));

        await orchestrator.runAIWorkflow('test prompt');

        expect(mockFileSystemService.move).not.toHaveBeenCalled();
    });
});
