import { jest, describe, it, beforeAll, expect } from '@jest/globals';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

describe('CLI Entry Point Integration Tests', () => {
    const cliPath = path.resolve(process.cwd(), 'dist', 'src', 'cli.js');

    beforeAll(async () => {
        // Ensure build exists
        // We assume 'npm run build' is run before tests or part of test script
        // But let's run it to be safe? No, it takes time. 
        // The test:integration script runs build.
    });

    it('should show help', async () => {
        const { stdout } = await execAsync(`node ${cliPath} --help`);
        expect(stdout).toContain('Usage: nexical');
        expect(stdout).toContain('Options:');
    });

    it.skip('should accept --prompt argument', async () => {
        // This runs the real application. 
        // Without a valid project or mocked dependencies, it might fail or try to call LLM.
        // However, we just want to verify argument parsing.
        // If we run with a prompt, Orchestrator.execute is called.
        // If we can't easily mock inside the child process, we might just check for a specific error 
        // that indicates it tried to run, e.g. "No default agent plugin registered" or similar,
        // OR we can rely on the fact that it doesn't crash immediately.

        // Let's try running with a prompt and expect it to fail gracefully or output something specific 
        // if we are in a directory without agents.

        try {
            await execAsync(`node ${cliPath} --prompt "test"`);
        } catch (error: any) {
            // It's expected to fail if no agents are configured in CWD
            // But we want to ensure it TRIED to run.
            // The error message should come from Orchestrator/Planner.
            // "No default agent plugin registered" is a good sign it reached the logic.
            expect(error.stderr || error.stdout).toMatch(/No default agent plugin registered|Error generating plan/);
        }
    }, 60000);
});
