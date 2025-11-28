import { jest } from '@jest/globals';
import path from 'path';
import fs from 'fs-extra';
import { Orchestrator } from '../../../src/orchestrator.js';

describe('Plugin Loading Integration Tests', () => {
    let orchestrator: Orchestrator;
    const testPluginsDir = path.join(process.cwd(), 'tests', 'fixtures', 'plugins');
    const commandsDir = path.join(testPluginsDir, 'commands');
    const agentsDir = path.join(testPluginsDir, 'agents');

    beforeAll(async () => {
        // Create dummy plugins
        await fs.ensureDir(commandsDir);
        await fs.ensureDir(agentsDir);

        const dummyCommandPlugin = `
            export class TestCommandPlugin {
                name = 'test-command';
                description = 'A test command plugin';
                constructor(core) { this.core = core; }
                async execute(args) { return 'executed'; }
            }
        `;

        const dummyAgentPlugin = `
            export class TestAgentPlugin {
                name = 'test-agent';
                description = 'A test agent plugin';
                constructor(core) { this.core = core; }
                async execute(agent, prompt, context) { return 'executed'; }
            }
        `;

        await fs.writeFile(path.join(commandsDir, 'TestCommandPlugin.js'), dummyCommandPlugin);
        await fs.writeFile(path.join(agentsDir, 'TestAgentPlugin.js'), dummyAgentPlugin);
    });

    afterAll(async () => {
        await fs.remove(testPluginsDir);
    });

    beforeEach(() => {
        // We need to mock the config to point to our test plugins dir
        // But Orchestrator calculates paths in constructor.
        // We can subclass or just modify the instance after creation, 
        // but loadPlugins uses config.appPath.

        // Let's mock process.cwd or just overwrite config after init?
        // loadPlugins is called in init().

        orchestrator = new Orchestrator([]);
        // Override appPath to point to our test fixtures parent directory
        // loadPlugins looks for path.join(appPath, 'plugins')
        orchestrator.config.appPath = path.dirname(testPluginsDir);
    });

    it('should load command and agent plugins from the filesystem', async () => {
        await orchestrator.init();

        const commandPlugin = orchestrator.commandRegistry.get('test-command');
        expect(commandPlugin).toBeDefined();
        expect(commandPlugin?.name).toBe('test-command');

        const agentPlugin = orchestrator.agentRegistry.get('test-agent');
        expect(agentPlugin).toBeDefined();
        expect(agentPlugin?.name).toBe('test-agent');
    });
});
