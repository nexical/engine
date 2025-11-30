import { jest, expect, describe, it, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CommandRegistry } from '../../../src/plugins/CommandRegistry.js';
import { CommandPlugin } from '../../../src/models/Plugins.js';

describe('CommandRegistry', () => {
    let registry: CommandRegistry;
    let mockPlugin: CommandPlugin;
    let tempDir: string;

    beforeEach(() => {
        registry = new CommandRegistry({} as any);
        mockPlugin = {
            name: 'test-command',
            description: 'Test Command',
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
        expect(registry.get('test-command')).toBe(mockPlugin);
    });

    it('should warn on duplicate registration', () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
        registry.register(mockPlugin);
        registry.register(mockPlugin);
        expect(consoleSpy).toHaveBeenCalledWith("Command plugin 'test-command' is already registered. Overwriting.");
        consoleSpy.mockRestore();
    });

    it('should return undefined for unknown plugin', () => {
        expect(registry.get('unknown')).toBeUndefined();
    });

    it('should return all plugins', () => {
        const plugin2 = { ...mockPlugin, name: 'command2' };
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
                export class ValidPlugin {
                    constructor(registry) {
                        this.name = 'valid-plugin';
                        this.description = 'Valid Plugin';
                    }
                    execute() {}
                }
            `;
            fs.writeFileSync(path.join(tempDir, 'ValidPlugin.js'), pluginContent);

            await registry.load(tempDir);

            expect(registry.get('valid-plugin')).toBeDefined();
        });

        it('should ignore non-plugin files', async () => {
            fs.writeFileSync(path.join(tempDir, 'readme.txt'), 'This is not a plugin');
            await registry.load(tempDir);
            expect(registry.getAll()).toHaveLength(0);
        });

        it('should handle import errors', async () => {
            // Create a file with invalid syntax to cause import error
            const errorFile = path.join(tempDir, 'ErrorPlugin.js');
            fs.writeFileSync(errorFile, "throw new Error('Import failed');");

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

            await registry.load(tempDir);

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to load command plugin'), expect.any(Error));
            consoleSpy.mockRestore();
        });

        it('should ignore invalid plugin classes', async () => {
            const pluginContent = `
                export class InvalidPlugin {
                    constructor(registry) {
                        // Missing name
                    }
                }
            `;
            fs.writeFileSync(path.join(tempDir, 'InvalidPlugin.js'), pluginContent);

            await registry.load(tempDir);
            expect(registry.getAll()).toHaveLength(0);
        });

        it('should ignore non-function exports', async () => {
            const pluginContent = `
                export const notAPlugin = "I am a string";
                export const config = { foo: 'bar' };
            `;
            fs.writeFileSync(path.join(tempDir, 'NotFunction.js'), pluginContent);

            await registry.load(tempDir);
            expect(registry.getAll()).toHaveLength(0);
        });
    });
});
