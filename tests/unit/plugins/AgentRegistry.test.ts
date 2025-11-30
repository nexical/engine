import { jest, expect, describe, it, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AgentRegistry } from '../../../src/plugins/AgentRegistry.js';
import { AgentPlugin } from '../../../src/models/Plugins.js';

describe('AgentRegistry', () => {
    let registry: AgentRegistry;
    let mockPlugin: AgentPlugin;
    let tempDir: string;

    beforeEach(() => {
        registry = new AgentRegistry();
        mockPlugin = {
            name: 'test-agent',
            description: 'Test Agent',
            execute: jest.fn()
        } as any;
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plotris-test-'));
        fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ type: 'module' }));
    });

    afterEach(() => {
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('should register a plugin', () => {
        registry.register(mockPlugin);
        expect(registry.get('test-agent')).toBe(mockPlugin);
    });

    it('should register a default plugin', () => {
        registry.register(mockPlugin, true);
        expect(registry.getDefault()).toBe(mockPlugin);
    });

    it('should warn on duplicate registration', () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
        registry.register(mockPlugin);
        registry.register(mockPlugin);
        expect(consoleSpy).toHaveBeenCalledWith("Agent plugin 'test-agent' is already registered. Overwriting.");
        consoleSpy.mockRestore();
    });

    it('should return undefined for unknown plugin', () => {
        expect(registry.get('unknown')).toBeUndefined();
    });

    it('should return all plugins', () => {
        const plugin2 = { ...mockPlugin, name: 'agent2' };
        registry.register(mockPlugin);
        registry.register(plugin2);
        expect(registry.getAll()).toHaveLength(2);
        expect(registry.getAll()).toContain(mockPlugin);
        expect(registry.getAll()).toContain(plugin2);
    });

    describe('load', () => {
        it('should do nothing if directory does not exist', async () => {
            const nonExistentDir = path.join(tempDir, 'non-existent');
            await registry.load(nonExistentDir);
            // Should not throw
        });

        it('should load valid plugins', async () => {
            const pluginContent = `
                export class ValidAgent {
                    constructor(registry) {
                        this.name = 'valid-agent';
                        this.description = 'Valid Agent';
                    }
                    execute() {}
                }
            `;
            fs.writeFileSync(path.join(tempDir, 'ValidAgent.js'), pluginContent);

            await registry.load(tempDir);

            expect(registry.get('valid-agent')).toBeDefined();
        });

        it('should identify default plugin', async () => {
            const pluginContent = `
                export class CLIAgent {
                    constructor(registry) {
                        this.name = 'cli';
                        this.description = 'CLI Agent';
                    }
                    execute() {}
                }
            `;
            fs.writeFileSync(path.join(tempDir, 'CLIAgent.js'), pluginContent);

            await registry.load(tempDir);

            expect(registry.getDefault()?.name).toBe('cli');
        });

        it('should ignore non-plugin files', async () => {
            fs.writeFileSync(path.join(tempDir, 'readme.txt'), 'This is not a plugin');
            await registry.load(tempDir);
            expect(registry.getAll()).toHaveLength(0);
        });

        it('should handle import errors', async () => {
            // Create a file with invalid syntax to cause import error
            fs.writeFileSync(path.join(tempDir, 'ErrorAgent.js'), "throw new Error('Import failed');");

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

            await registry.load(tempDir);

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to load agent plugin'), expect.any(Error));
            consoleSpy.mockRestore();
        });

        it('should ignore invalid plugin classes', async () => {
            const pluginContent = `
                export class InvalidAgent {
                    constructor(registry) {
                        // Missing name
                    }
                }
            `;
            fs.writeFileSync(path.join(tempDir, 'InvalidAgent.js'), pluginContent);

            await registry.load(tempDir);
            expect(registry.getAll()).toHaveLength(0);
        });

        it('should ignore non-function exports', async () => {
            const pluginContent = `
                export const notAnAgent = "I am a string";
                export const config = { foo: 'bar' };
            `;
            fs.writeFileSync(path.join(tempDir, 'NotFunction.js'), pluginContent);

            await registry.load(tempDir);
            expect(registry.getAll()).toHaveLength(0);
        });
    });
});
