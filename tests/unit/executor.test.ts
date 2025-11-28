import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import { Plan } from '../../src/models/Plan.js';

const mockAgentRunner = {
    runAgent: jest.fn(),
};

const mockOrchestrator = {
    agentRunner: mockAgentRunner,
};

jest.unstable_mockModule('../../src/orchestrator.js', () => ({
    Orchestrator: jest.fn().mockImplementation(() => mockOrchestrator),
}));

jest.unstable_mockModule('../../src/services/AgentRunner.js', () => ({
    AgentRunner: jest.fn().mockImplementation(() => mockAgentRunner),
}));

const { Executor } = await import('../../src/executor.js');

describe('Executor', () => {
    let executor: any;

    beforeEach(() => {
        (mockAgentRunner.runAgent as any).mockReset();
        (mockAgentRunner.runAgent as any).mockResolvedValue(undefined);
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
});
