import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import { Plan } from '../../../src/models/Plan.js';
import { SignalDetectedError } from '../../../src/errors/SignalDetectedError.js';

const mockAgentRunner = {
    runAgent: jest.fn(),
};

const mockOrchestrator = {
    agentRunner: mockAgentRunner,
    config: { nexicalPath: '/nexical' }
};

const mockFs = {
    existsSync: jest.fn(),
    readdirSync: jest.fn(),
    readFileSync: jest.fn(),
};

jest.unstable_mockModule('fs-extra', () => ({ default: mockFs }));

jest.unstable_mockModule('../../../src/orchestrator.js', () => ({
    Orchestrator: jest.fn().mockImplementation(() => mockOrchestrator),
}));

jest.unstable_mockModule('../../../src/services/AgentRunner.js', () => ({
    AgentRunner: jest.fn().mockImplementation(() => mockAgentRunner),
}));

const { Executor } = await import('../../../src/workflow/executor.js');

describe('Executor', () => {
    let executor: any;

    beforeEach(() => {
        (mockAgentRunner.runAgent as any).mockReset();
        (mockAgentRunner.runAgent as any).mockResolvedValue(undefined);
        mockFs.existsSync.mockReturnValue(false);
        executor = new Executor(mockOrchestrator as any);
    });

    it('should detect cycles in the plan', async () => {
        const cyclicPlan: Plan = {
            plan_name: 'Cyclic Plan',
            tasks: [
                {
                    id: 'A',
                    description: 'Task A',
                    message: 'A',
                    agent: 'agent',
                    dependencies: ['B'],
                },
                {
                    id: 'B',
                    description: 'Task B',
                    message: 'B',
                    agent: 'agent',
                    dependencies: ['A'],
                },
            ],
        };

        await expect(executor.executePlan(cyclicPlan, '')).rejects.toThrow(/Cycle detected/);
    });

    it('should execute tasks in topological order', async () => {
        const plan: Plan = {
            plan_name: 'Ordered Plan',
            tasks: [
                {
                    id: 'C',
                    description: 'Task C',
                    message: 'C',
                    agent: 'agent',
                    dependencies: ['B'],
                },
                {
                    id: 'A',
                    description: 'Task A',
                    message: 'A',
                    agent: 'agent',
                    dependencies: [],
                },
                {
                    id: 'B',
                    description: 'Task B',
                    message: 'B',
                    agent: 'agent',
                    dependencies: ['A'],
                },
            ],
        };

        await expect(executor.executePlan(plan, '')).resolves.not.toThrow();
        expect(mockAgentRunner.runAgent).toHaveBeenCalledTimes(3);
    });

    it('should assign temporary IDs to tasks without IDs', async () => {
        const plan = {
            plan_name: 'Test Plan',
            tasks: [
                { description: 'Task 1', message: 'Doing task 1', agent: 'agent-1' }
            ]
        };

        await executor.executePlan(plan as any, 'prompt');

        expect(mockAgentRunner.runAgent).toHaveBeenCalled();
        const taskArg = mockAgentRunner.runAgent.mock.calls[0][0] as any;
        expect(taskArg.id).toBeDefined();
        expect(taskArg.id).toMatch(/^temp-/);
    });

    it('should throw if dependency not found', async () => {
        const plan = {
            plan_name: 'Test Plan',
            tasks: [
                { id: 'task-1', description: 'Task 1', message: 'Doing task 1', agent: 'agent-1', dependencies: ['unknown-task'] }
            ]
        };

        await expect(executor.executePlan(plan, 'prompt')).rejects.toThrow('Task unknown-task not found in plan.');
    });

    it('should handle agent execution failure', async () => {
        const plan = {
            plan_name: 'Test Plan',
            tasks: [
                { id: 'task-1', description: 'Task 1', message: 'Doing task 1', agent: 'agent-1' }
            ]
        };
        (mockAgentRunner.runAgent as any).mockRejectedValue(new Error('Agent failed'));
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        await expect(executor.executePlan(plan, 'prompt')).rejects.toThrow('Agent failed');
        expect(consoleSpy).toHaveBeenCalledWith('Plan execution failed:', expect.any(Error));
        consoleSpy.mockRestore();
    });

    it('should detect signals and throw SignalDetectedError', async () => {
        const plan = {
            plan_name: 'Test Plan',
            tasks: [
                { id: 'task-1', description: 'Task 1', message: 'Doing task 1', agent: 'agent-1' }
            ]
        };

        // Mock signal file existence
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readdirSync.mockReturnValue(['REPLAN_signal.md']);
        mockFs.readFileSync.mockReturnValue('Reason: error');

        await expect(executor.executePlan(plan, 'prompt')).rejects.toThrow(SignalDetectedError);

        // Verify signal content
        try {
            await executor.executePlan(plan, 'prompt');
        } catch (e) {
            if (e instanceof SignalDetectedError) {
                expect(e.signal.type).toBe('REPLAN');
                expect(e.signal.reason).toBe('Reason: error');
            }
        }
    });

    it('should detect REARCHITECT signal and throw SignalDetectedError', async () => {
        const plan = {
            plan_name: 'Test Plan',
            tasks: [
                { id: 'task-1', description: 'Task 1', message: 'Doing task 1', agent: 'agent-1' }
            ]
        };

        // Mock signal file existence
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readdirSync.mockReturnValue(['REARCHITECT_signal.md']);
        mockFs.readFileSync.mockReturnValue('Reason: bad architecture');

        await expect(executor.executePlan(plan, 'prompt')).rejects.toThrow(SignalDetectedError);

        // Verify signal content
        try {
            await executor.executePlan(plan, 'prompt');
        } catch (e) {
            if (e instanceof SignalDetectedError) {
                expect(e.signal.type).toBe('REARCHITECT');
                expect(e.signal.reason).toBe('Reason: bad architecture');
            }
        }
    });

    it('should detect invalidates_previous_work flag in signal', async () => {
        const plan = {
            plan_name: 'Test Plan',
            tasks: [
                { id: 'task-1', description: 'Task 1', message: 'Doing task 1', agent: 'agent-1' }
            ]
        };

        // Mock signal file existence
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readdirSync.mockReturnValue(['REARCHITECT_signal.md']);
        mockFs.readFileSync.mockReturnValue('Reason: bad architecture\ninvalidates_previous_work: true');

        await expect(executor.executePlan(plan, 'prompt')).rejects.toThrow(SignalDetectedError);

        // Verify signal content
        try {
            await executor.executePlan(plan, 'prompt');
        } catch (e) {
            if (e instanceof SignalDetectedError) {
                expect(e.signal.type).toBe('REARCHITECT');
                expect(e.signal.invalidates_previous_work).toBe(true);
            }
        }
    });

    it('should do nothing if signals directory is empty', async () => {
        const plan = {
            plan_name: 'Test Plan',
            tasks: [
                { id: 'task-1', description: 'Task 1', message: 'Doing task 1', agent: 'agent-1' }
            ]
        };

        // Mock signal file existence but empty directory
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readdirSync.mockReturnValue([]);

        await expect(executor.executePlan(plan, 'prompt')).resolves.not.toThrow();
    });
});
