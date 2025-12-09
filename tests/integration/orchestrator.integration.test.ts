import { jest, describe, it, beforeEach, afterEach, beforeAll, afterAll, expect } from '@jest/globals';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { Plan } from '../../src/models/Plan.js';
import { Skill } from '../../src/models/Skill.js';

// Mock Planner to avoid LLM calls
const mockGeneratePlan = jest.fn<(prompt: string, signal?: any, completed?: any[]) => Promise<Plan>>();
jest.unstable_mockModule('../../src/workflow/planner.js', () => ({
    Planner: jest.fn().mockImplementation(() => ({
        generatePlan: mockGeneratePlan
    }))
}));

const mockGenerateArchitecture = jest.fn();
jest.unstable_mockModule('../../src/workflow/architect.js', () => ({
    Architect: jest.fn().mockImplementation(() => ({
        generateArchitecture: mockGenerateArchitecture
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
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nexical-orch-test-'));

        // Setup project structure with a dummy agent
        const nexicalDir = path.join(tempDir, '.nexical');
        const agentsDir = path.join(nexicalDir, 'agents');
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
        const runtimeConfig = {
            workingDirectory: tempDir,
            jobContext: {
                job_id: 'test-job',
                project_id: 'test-project',
                organization_id: 'test-org',
                step_id: 'test-step'
            }
        };
        orchestrator = new Orchestrator(runtimeConfig as any);

        // Register dummy skill
        const dummySkill: Skill = {
            name: 'dummy',
            description: 'Dummy skill',
            execute: jest.fn<Skill['execute']>().mockResolvedValue('success'),
            isSupported: jest.fn<Skill['isSupported']>().mockReturnValue(true)
        };
        orchestrator.skillRegistry.register(dummySkill);

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

        mockGeneratePlan.mockImplementation(async () => {
            const planPath = path.join(tempDir, '.nexical', 'plan.yml');
            await fs.writeFile(planPath, JSON.stringify(mockPlan));
            return mockPlan;
        });

        await orchestrator.runAIWorkflow(prompt);

        expect(mockGeneratePlan).toHaveBeenCalledWith(prompt, undefined, expect.anything());

        const dummyPlugin = orchestrator.skillRegistry.get('dummy');
        expect(dummyPlugin?.execute).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'dummy' }),
            'Do it',
            expect.anything()
        );
    });
});
