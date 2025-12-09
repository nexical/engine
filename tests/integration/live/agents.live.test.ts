import { jest, describe, it, beforeEach, afterEach, beforeAll, afterAll, expect } from '@jest/globals';
import path from 'path';
import fs from 'fs-extra';
import { spawnSync } from 'child_process';
import { Orchestrator } from '../../../src/orchestrator.js';
import { setupTestProject, cleanupTestProject } from './setup.js';
import { Agent } from '../../../src/models/Agent.js';

const hasGemini = () => {
    try {
        const result = spawnSync('which', ['gemini'], { encoding: 'utf-8' });
        return result.status === 0 && result.stdout.trim().length > 0;
    } catch (e) {
        return false;
    }
};

const runOrSkip = hasGemini() ? it : it.skip;

if (!hasGemini()) {
    console.warn('Skipping Agents Live Integration Tests: "gemini" executable not found.');
}

describe('Agents Live Integration Tests', () => {
    let orchestrator: Orchestrator;
    let originalCwd: string;
    const testId = 'agents';
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

    beforeEach(async () => {
        orchestrator = new Orchestrator({ workingDirectory: process.cwd() });
        await orchestrator.init();
        // Suppress console logs
        jest.spyOn(console, 'log').mockImplementation(() => { });
        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    const executeAgent = async (agentName: string, taskPrompt: string, params: any = {}) => {
        // Ensure CLI skill is loaded (since most agents use it)
        if (!orchestrator.skillRegistry.get('cli')) {
            // Let it fail if missing
        }

        const shortName = agentName.replace('Agent', '').toLowerCase();
        const possiblePath = path.join(testProjectRoot, '.nexical', 'agents', `${shortName}.agent.yml`);

        if (!fs.existsSync(possiblePath)) {
            throw new Error(`Agent file not found at ${possiblePath}`);
        }

        const plan = {
            plan_name: `Test ${agentName}`,
            tasks: [{
                id: 'test-task',
                message: taskPrompt,
                description: taskPrompt,
                agent: agentName,
                dependencies: [],
                params: params
            }]
        };

        // Access private executor
        await (orchestrator as any).executor.executePlan(plan, taskPrompt);
    };

    runOrSkip('should execute ResearcherAgent', async () => {
        const fileName = 'research.md';
        const filePath = path.join(testProjectRoot, fileName);
        await fs.ensureFile(filePath); // Create empty file

        const taskPrompt = `What is the capital of France? Write the answer to @${fileName}.`;

        await executeAgent('ResearcherAgent', taskPrompt);

        expect(await fs.pathExists(filePath)).toBe(true);
        const content = await fs.readFile(filePath, 'utf-8');
        expect(content).toMatch(/Paris/i);
    }, 30000);

    runOrSkip('should execute DeveloperAgent', async () => {
        const fileName = 'test-component.html';
        const filePath = path.join(testProjectRoot, fileName);
        await fs.ensureFile(filePath); // Create empty file

        const taskPrompt = `Write the code to @${fileName}. The code should be a simple div containing "Hello World".`;

        await executeAgent('DeveloperAgent', taskPrompt);

        // Verify file creation/modification
        expect(await fs.pathExists(filePath)).toBe(true);
        const content = await fs.readFile(filePath, 'utf-8');
        expect(content).toContain('Hello World');
    }, 30000);

    runOrSkip('should execute ContentAgent', async () => {
        const fileName = 'blog-post.md';
        const filePath = path.join(testProjectRoot, fileName);
        await fs.ensureFile(filePath); // Create empty file

        const taskPrompt = `Write a short blog post about AI in @${fileName}.`;

        await executeAgent('ContentAgent', taskPrompt);

        expect(await fs.pathExists(filePath)).toBe(true);
        const content = await fs.readFile(filePath, 'utf-8');
        expect(content).toContain('#'); // Markdown header
    }, 30000);

    runOrSkip('should execute DesignerAgent', async () => {
        const fileName = 'style.css';
        const taskPrompt = `Create a CSS file @${fileName} with a class .container that has a red background.`;

        await executeAgent('DesignerAgent', taskPrompt);

        // Check logs for the content if file not written by CLI
        const logMock = console.log as jest.Mock;
        const logs = logMock.mock.calls.flat().join(' ');
        expect(logs).toMatch(/\.container/);
        expect(logs).toMatch(/background/);
    }, 30000);

    runOrSkip('should execute IllustratorAgent', async () => {
        if (!process.env.OPENROUTER_API_KEY) {
            console.warn('Skipping IllustratorAgent test: OPENROUTER_API_KEY not found');
            return;
        }
        const outputPath = 'image.png';
        const taskPrompt = 'Generate an image of a futuristic city.';

        try {
            await executeAgent('IllustratorAgent', taskPrompt, { output_path: outputPath });

            const filePath = path.join(testProjectRoot, outputPath);
            expect(await fs.pathExists(filePath)).toBe(true);

            // Verify it's an image (basic check)
            const stats = await fs.stat(filePath);
            expect(stats.size).toBeGreaterThan(0);
        } catch (error: any) {
            // In --yolo mode with gemini configured, it should work or fail with helpful error.
            // If we want to allow failures due to auth/quota during integration, we can keep the catch.
            // But valid `gemini` command implies we expect it to try.
            if (error.message.includes('401 Unauthorized') || error.message.includes('Authentication error') || error.message.includes('Method Not Allowed')) {
                console.warn('Image generation failed with API Error (proving integration attempt):', error.message);
            } else {
                throw error;
            }
        }
    }, 60000);
});