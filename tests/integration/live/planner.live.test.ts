import { jest, describe, it, beforeEach, afterEach, beforeAll, afterAll, expect } from '@jest/globals';
import { Orchestrator } from '../../../src/orchestrator.js';
import { setupTestProject, cleanupTestProject } from './setup.js';
import path from 'path';
import fs from 'fs-extra';

describe('Planner Live Integration Tests', () => {
    let orchestrator: Orchestrator;
    let originalCwd: string;
    const testId = 'planner';
    let testProjectRoot: string;

    beforeAll(async () => {
        originalCwd = process.cwd();
        testProjectRoot = await setupTestProject(testId);
        process.chdir(testProjectRoot);
    });

    afterAll(async () => {
        process.chdir(originalCwd);
        await cleanupTestProject(testId);
    });

    beforeEach(() => {
        orchestrator = new Orchestrator([]);
        // Suppress console logs
        jest.spyOn(console, 'log').mockImplementation(() => { });
        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should generate a plan based on user prompt', async () => {
        await orchestrator.init();

        const planner = (orchestrator as any).planner;
        const prompt = "Create a plan to say hello world using the DeveloperAgent.";

        const plan = await planner.generatePlan(prompt);

        expect(plan).toBeDefined();
        expect(plan.tasks.length).toBeGreaterThan(0);

        // Verify plan file creation
        const planPath = path.join(testProjectRoot, '.plotris', 'history', 'plan.yml');
        expect(await fs.pathExists(planPath)).toBe(true);

        const agentNames = plan.tasks.map((t: any) => t.agent);
        const knownAgents = ['ResearcherAgent', 'DesignerAgent', 'DeveloperAgent', 'ContentAgent', 'IllustratorAgent'];
        const hasKnownAgent = agentNames.some((name: string) => knownAgents.includes(name));

        expect(hasKnownAgent).toBe(true);
    }, 120000); // Increase timeout to 2 minutes
});
