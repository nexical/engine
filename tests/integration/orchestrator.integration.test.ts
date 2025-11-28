import { jest, describe, it, beforeEach, afterEach, beforeAll, afterAll, expect } from '@jest/globals';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { Plan } from '../../src/models/Plan.js';
import { AgentPlugin } from '../../src/models/Plugins.js';

// Mock Planner to avoid LLM calls
const mockGeneratePlan = jest.fn<(prompt: string) => Promise<Plan>>();
jest.unstable_mockModule('../../src/planner.js', () => ({
    Planner: jest.fn().mockImplementation(() => ({
        generatePlan: mockGeneratePlan
    }))
}));

// Import Orchestrator AFTER mocking
const { Orchestrator } = await import('../../src/orchestrator.js');

// Import Orchestrator type for type annotation
import type { Orchestrator as OrchestratorType } from '../../src/orchestrator.js';

describe('Orchestrator Integration Tests', () => {
    let orchestrator: OrchestratorType;
    let tempDir: string;
    let originalCwd: string;

    beforeAll(async () => {
        originalCwd = process.cwd();
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plotris-orch-test-'));

        // Setup project structure with a dummy agent
        const plotrisDir = path.join(tempDir, '.plotris');
        const agentsDir = path.join(plotrisDir, 'agents');
        await fs.ensureDir(agentsDir);

        const dummyAgentContent = `
name: dummy
description: Dummy agent
provider: dummy
`;
        await fs.writeFile(path.join(agentsDir, 'dummy.agent.yml'), dummyAgentContent);

        // Change CWD so Orchestrator picks up the project
        process.chdir(tempDir);
    });

    afterAll(async () => {
        process.chdir(originalCwd);
        await fs.remove(tempDir);
    });

    beforeEach(() => {
        jest.clearAllMocks();
        // @ts-ignore - Dynamic import makes constructor usage tricky with types
        orchestrator = new Orchestrator(['node', 'cli']);

        // Register dummy plugin
        const dummyPlugin: AgentPlugin = {
            name: 'dummy',
            description: 'Dummy agent',
            execute: jest.fn<AgentPlugin['execute']>().mockResolvedValue('success')
        };
        orchestrator.agentRegistry.register(dummyPlugin);

        // Suppress console logs
        jest.spyOn(console, 'log').mockImplementation(() => { });
        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should execute a full workflow from prompt to completion', async () => {
        const prompt = 'Do something';
        const mockPlan: Plan = {
            plan_name: 'Test Plan',
            tasks: [
                {
                    id: 'task-1',
                    message: 'Task 1',
                    description: 'Do it',
                    agent: 'dummy',
                    dependencies: []
                }
            ]
        };

        mockGeneratePlan.mockResolvedValue(mockPlan);

        await orchestrator.runAIWorkflow(prompt);

        expect(mockGeneratePlan).toHaveBeenCalledWith(prompt);

        const dummyPlugin = orchestrator.agentRegistry.get('dummy');
        expect(dummyPlugin?.execute).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'dummy' }),
            'Do it',
            expect.anything()
        );
    });
});
