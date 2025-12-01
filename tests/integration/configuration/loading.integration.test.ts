import { jest, describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { Orchestrator } from '../../../src/orchestrator.js';

describe('Configuration Loading Integration Tests', () => {
    let orchestrator: Orchestrator;
    let tempDir: string;
    let originalCwd: string;

    beforeAll(async () => {
        originalCwd = process.cwd();
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nexical-test-'));

        // Setup project structure
        const nexicalDir = path.join(tempDir, '.nexical');
        const agentsDir = path.join(nexicalDir, 'agents');
        await fs.ensureDir(agentsDir);

        // Create capabilities.yml
        const capabilitiesContent = `
agents:
  - name: test-agent
    description: A test agent
    provider: cli
`;
        await fs.writeFile(path.join(agentsDir, 'capabilities.yml'), capabilitiesContent);

        // Create custom agent definition
        const customAgentContent = `
name: custom-agent
description: A custom agent
provider: cli
command: echo
args: ["hello"]
`;
        await fs.writeFile(path.join(agentsDir, 'custom.agent.yml'), customAgentContent);

        // Create planner prompt
        await fs.writeFile(path.join(agentsDir, 'planner.md'), 'Test Planner Prompt');

        // Change CWD to temp dir
        process.chdir(tempDir);
    });

    afterAll(async () => {
        // Restore CWD
        process.chdir(originalCwd);
        // Cleanup
        await fs.remove(tempDir);
    });

    it('should correctly identify project path and load configuration', async () => {
        orchestrator = new Orchestrator([]);
        await orchestrator.init();

        expect(orchestrator.config.projectPath).toBe(tempDir);
        expect(orchestrator.config.agentsPath).toBe(path.join(tempDir, '.nexical', 'agents'));
    });

    it('should load capabilities.yml for the planner', async () => {
        // We can't easily access private planner, but we can check if generatePlan works 
        // and if it uses the capabilities. 
        // However, generatePlan requires a running agent.
        // Let's rely on the fact that Planner reads the file.
        // Or we can inspect the orchestrator.disk if we spy on it?
        // No, we want to test real loading.

        // Let's use a spy on fs.readFileSync or similar if we want to be sure, 
        // but checking the side effect is better.

        // Since we can't inspect Planner's internal state easily without casting to any,
        // let's do that for verification purposes in this test.
        const planner = (orchestrator as any).planner;
        const capabilities = planner.getAgentCapabilities();

        expect(capabilities).toContain('name: test-agent');
    });

    it('should load custom agent definitions', async () => {
        // AgentRunner loads agents in constructor.
        // We can check if the agent is available in AgentRunner.
        const executor = (orchestrator as any).executor;
        const agentRunner = (executor as any).agentRunner;

        // AgentRunner.agents is private.
        const agents = agentRunner.agents;

        expect(agents['custom-agent']).toBeDefined();
        expect(agents['custom-agent'].description).toBe('A custom agent');
    });
});
