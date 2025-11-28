import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import { Planner } from '../../src/planner.js';
import { Orchestrator } from '../../src/orchestrator.js';
import { AgentRegistry } from '../../src/plugins/AgentRegistry.js';
import { FileSystemService } from '../../src/services/FileSystemService.js';
import { AgentPlugin } from '../../src/models/Plugins.js';

// Mock dependencies
jest.mock('../../src/plugins/AgentRegistry.js');
jest.mock('../../src/services/FileSystemService.js');

describe('Planner Integration Tests', () => {
    let orchestrator: Orchestrator;
    let planner: Planner;
    let mockAgentRegistry: jest.Mocked<AgentRegistry>;
    let mockDisk: jest.Mocked<FileSystemService>;
    let mockAgentPlugin: jest.Mocked<AgentPlugin>;

    const mockPlanYaml = `
plan_name: Mock Plan
tasks:
  - id: task-1
    message: Do something
    dependencies: []
`;

    beforeEach(() => {
        // Setup mock AgentPlugin
        mockAgentPlugin = {
            name: 'mock-agent',
            execute: jest.fn<AgentPlugin['execute']>().mockResolvedValue(mockPlanYaml)
        } as unknown as jest.Mocked<AgentPlugin>;

        // Setup mock AgentRegistry
        mockAgentRegistry = {
            getDefault: jest.fn().mockReturnValue(mockAgentPlugin),
            register: jest.fn(),
            get: jest.fn(),
            getAll: jest.fn(),
        } as unknown as jest.Mocked<AgentRegistry>;

        // Setup mock FileSystemService
        mockDisk = {
            exists: jest.fn().mockReturnValue(true),
            readFile: jest.fn().mockReturnValue('Mock Prompt Template'),
            writeFile: jest.fn(),
        } as unknown as jest.Mocked<FileSystemService>;

        // Setup partial Orchestrator mock
        orchestrator = {
            config: {
                appPath: '/mock/app',
                agentsPath: '/mock/agents',
                historyPath: '/mock/history',
            },
            disk: mockDisk,
            agentRegistry: mockAgentRegistry,
        } as unknown as Orchestrator;

        // Instantiate Planner
        planner = new Planner(orchestrator);

        // Suppress console.error
        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should generate a plan and save it to history', async () => {
        const prompt = 'Create a website';

        const plan = await planner.generatePlan(prompt);

        // Verify AgentPlugin was called
        expect(mockAgentPlugin.execute).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'planner' }),
            '',
            expect.objectContaining({
                params: expect.objectContaining({
                    prompt: expect.stringContaining('Mock Prompt Template')
                })
            })
        );

        // Verify Plan structure
        expect(plan).toBeDefined();
        expect(plan.plan_name).toBe('Mock Plan');
        expect(plan.tasks).toHaveLength(1);
        expect(plan.tasks[0].id).toBe('task-1');

        // Verify History Saving
        expect(mockDisk.writeFile).toHaveBeenCalledWith(
            expect.stringMatching(/plan-.*\.yml$/),
            expect.stringContaining('plan_name: Mock Plan')
        );
    });

    it('should throw error if no default agent is registered', async () => {
        mockAgentRegistry.getDefault.mockReturnValue(undefined);

        await expect(planner.generatePlan('test')).rejects.toThrow('No default agent plugin registered.');
    });

    it('should handle agent execution failure', async () => {
        mockAgentPlugin.execute.mockRejectedValue(new Error('Agent failed'));

        await expect(planner.generatePlan('test')).rejects.toThrow('Agent failed');
    });
});
