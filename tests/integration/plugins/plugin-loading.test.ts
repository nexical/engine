import { jest } from '@jest/globals';
import path from 'path';
import fs from 'fs-extra';
import { Orchestrator } from '../../../src/orchestrator.js';

describe('Plugin Loading Integration Tests', () => {
    let orchestrator: Orchestrator;
    const testFixturesDir = path.join(process.cwd(), 'tests', 'fixtures');
    const commandsDir = path.join(testFixturesDir, 'commands');
    const skillsDir = path.join(testFixturesDir, 'skills');
    // Wait, Orchestrator.init:
    // pluginsDir = path.join(appPath, 'plugins')
    // skillsDir = path.join(appPath, 'skills')

    // In test setup: 
    // orchestrator.config.appPath = path.dirname(testPluginsDir); -> tests/fixtures
    // So pluginsDir = tests/fixtures/plugins (Correct)
    // skillsDir = tests/fixtures/skills (Desired)

    // So I should use tests/fixtures/skills.

    beforeAll(async () => {
        // Create dummy plugins
        await fs.ensureDir(commandsDir);
        await fs.ensureDir(skillsDir);

        const dummyCommandPlugin = `
            export class TestCommandPlugin {
                name = 'test-command';
                description = 'A test command plugin';
                constructor(core) { this.core = core; }
                async execute(args) { return 'executed'; }
            }
        `;

        const dummySkill = `
            export class TestSkill {
                name = 'test-skill';
                description = 'A test skill';
                constructor(core) { this.core = core; }
                isSupported() { return true; }
                async execute(agent, prompt, context) { return 'executed'; }
            }
        `;

        await fs.writeFile(path.join(commandsDir, 'TestCommandPlugin.js'), dummyCommandPlugin);
        await fs.writeFile(path.join(skillsDir, 'TestSkill.js'), dummySkill);
    });

    afterAll(async () => {
        await fs.remove(commandsDir);
        await fs.remove(skillsDir);
    });

    beforeEach(() => {
        // We need to mock the config to point to our test plugins dir
        // But Orchestrator calculates paths in constructor.
        // We can subclass or just modify the instance after creation, 
        // but loadPlugins uses config.appPath.

        // Let's mock process.cwd or just overwrite config after init?
        // loadPlugins is called in init().

        orchestrator = new Orchestrator({ workingDirectory: process.cwd() });
        // Override appPath to point to our test fixtures parent directory
        // loadPlugins looks for path.join(appPath, 'plugins')
        orchestrator.config.appPath = path.join(process.cwd(), 'tests', 'fixtures');
    });

    it('should load command plugins and skills from the filesystem', async () => {
        await orchestrator.init();

        const commandPlugin = orchestrator.commandRegistry.get('test-command');
        expect(commandPlugin).toBeDefined();
        expect(commandPlugin?.name).toBe('test-command');

        const skill = orchestrator.skillRegistry.get('test-skill');
        expect(skill).toBeDefined();
        expect(skill?.name).toBe('test-skill');
    });
});
