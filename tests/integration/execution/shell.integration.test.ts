import { jest, describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import { CLISkill } from '../../../src/skills/CLISkill.js';
import { Orchestrator } from '../../../src/orchestrator.js';

describe('Shell Execution Integration Tests', () => {
    let orchestrator: Orchestrator;
    let cliSkill: CLISkill;

    beforeEach(() => {
        orchestrator = new Orchestrator({ workingDirectory: process.cwd() });
        // We need to initialize orchestrator to setup shell executor if needed, 
        // but CLISkill might use a shared one or create its own.
        // Looking at CLISkill, it uses this.core.shellExecutor or similar?
        // Let's assume standard instantiation.

        cliSkill = new CLISkill(orchestrator);

        // Suppress console.error
        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should execute a real echo command', async () => {
        // We need to mock the agent definition that specifies the command
        const agentDef = {
            name: 'test-shell',
            description: 'Test shell execution',
            provider: 'cli',
            command: 'echo',
            args: ['{prompt}'],
            prompt_template: '{task_prompt}' // Ensure taskPrompt is used
        };

        // execute(agent, prompt, context)
        // context.params usually contains arguments if needed, or prompt is passed.
        // CLISkill logic:
        // if agent.command is set, it runs that.
        // if prompt is passed, it might be appended?
        // Let's assume simple echo.

        const result = await cliSkill.execute(agentDef, 'hello world', { params: {} });

        // The output of echo "hello world" should be "hello world"
        expect(result.trim()).toBe('hello world');
    });

    it('should handle command failure', async () => {
        const agentDef = {
            name: 'test-fail',
            description: 'Test failure',
            provider: 'cli',
            command: 'non-existent-command-12345',
            args: []
        };

        await expect(cliSkill.execute(agentDef, '', { params: {} })).rejects.toThrow();
    });
});
