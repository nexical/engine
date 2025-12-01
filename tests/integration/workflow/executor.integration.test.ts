import { jest } from '@jest/globals';
import type { Executor } from '../../../src/workflow/executor.js';
import type { Orchestrator } from '../../../src/orchestrator.js';
import type { AgentRunner } from '../../../src/services/AgentRunner.js';
import { Plan } from '../../../src/models/Plan.js';
import { Task } from '../../../src/models/Task.js';

// Define the mock factory
const mockRunAgent = jest.fn<(task: Task, userPrompt: string) => Promise<void>>().mockResolvedValue(undefined);
const MockAgentRunner = jest.fn(() => ({
    runAgent: mockRunAgent
}));

// Mock the module using unstable_mockModule
jest.unstable_mockModule('../../src/services/AgentRunner.js', () => ({
    AgentRunner: MockAgentRunner
}));

describe('Executor Integration Tests', () => {
    let ExecutorClass: typeof Executor;
    let orchestrator: Orchestrator;
    let executor: Executor;

    beforeAll(async () => {
        // Import the module under test AFTER mocking dependencies
        const module = await import('../../../src/workflow/executor.js');
        ExecutorClass = module.Executor;
    });

    beforeEach(() => {
        // Create a partial mock of Orchestrator
        orchestrator = {
            config: {
                agentsPath: '/mock/agents'
            },
            disk: {
                isDirectory: jest.fn().mockReturnValue(false)
            }
        } as unknown as Orchestrator;

        // Reset mocks
        jest.clearAllMocks();
        mockRunAgent.mockClear();
        MockAgentRunner.mockClear();

        // Instantiate Executor
        executor = new ExecutorClass(orchestrator);

        // Suppress console.error
        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should execute tasks in topological order', async () => {
        const plan: Plan = {
            plan_name: 'Test Plan',
            tasks: [
                { id: 'task-c', message: 'Task C', dependencies: ['task-b'], description: 'desc', agent: 'agent' },
                { id: 'task-a', message: 'Task A', dependencies: [], description: 'desc', agent: 'agent' },
                { id: 'task-b', message: 'Task B', dependencies: ['task-a'], description: 'desc', agent: 'agent' },
            ] as Task[]
        };

        const executionOrder: string[] = [];

        mockRunAgent.mockImplementation(async (task: any) => {
            executionOrder.push(task.id);
        });

        await executor.executePlan(plan, 'test prompt');

        expect(executionOrder).toEqual(['task-a', 'task-b', 'task-c']);
        expect(mockRunAgent).toHaveBeenCalledTimes(3);
    });

    it('should handle task failure and stop execution', async () => {
        const plan: Plan = {
            plan_name: 'Failure Plan',
            tasks: [
                { id: 'task-a', message: 'Task A', dependencies: [], description: 'desc', agent: 'agent' },
                { id: 'task-b', message: 'Task B', dependencies: ['task-a'], description: 'desc', agent: 'agent' },
            ] as Task[]
        };

        mockRunAgent.mockImplementation(async (task: any) => {
            if (task.id === 'task-a') {
                throw new Error('Task A failed');
            }
        });

        await expect(executor.executePlan(plan, 'test prompt')).rejects.toThrow('Task A failed');

        expect(mockRunAgent).toHaveBeenCalledTimes(1); // Only task-a should run
    });

    it('should run independent tasks in parallel (conceptually)', async () => {
        const plan: Plan = {
            plan_name: 'Parallel Plan',
            tasks: [
                { id: 'task-a', message: 'Task A', dependencies: [], description: 'desc', agent: 'agent' },
                { id: 'task-b', message: 'Task B', dependencies: [], description: 'desc', agent: 'agent' },
            ] as Task[]
        };

        let taskAStarted = false;
        let taskBStarted = false;

        mockRunAgent.mockImplementation(async (task: any) => {
            if (task.id === 'task-a') taskAStarted = true;
            if (task.id === 'task-b') taskBStarted = true;

            // Wait a bit to ensure both get a chance to start
            await new Promise(resolve => setTimeout(resolve, 10));
        });

        await executor.executePlan(plan, 'test prompt');

        expect(taskAStarted).toBe(true);
        expect(taskBStarted).toBe(true);
        expect(mockRunAgent).toHaveBeenCalledTimes(2);
    });
});
