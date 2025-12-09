import { jest, expect, describe, it, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SkillRegistry } from '../../../src/services/SkillRegistry.js';
import { Skill } from '../../../src/models/Skill.js';

describe('SkillRegistry', () => {
    let registry: SkillRegistry;
    let mockSkill: Skill;
    let tempDir: string;

    beforeEach(() => {
        registry = new SkillRegistry({} as any);
        mockSkill = {
            name: 'test-skill',
            description: 'Test Skill',
            isSupported: jest.fn().mockReturnValue(true) as any,
            execute: jest.fn()
        } as any;
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexical-test-'));
        fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ type: 'module' }));
    });

    afterEach(() => {
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('should register a skill', () => {
        registry.register(mockSkill);
        expect(registry.get('test-skill')).toBe(mockSkill);
    });

    it('should register a default skill', () => {
        registry.register(mockSkill, true);
        expect(registry.getDefault()).toBe(mockSkill);
    });

    it('should warn on duplicate registration', () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
        registry.register(mockSkill);
        registry.register(mockSkill);
        expect(consoleSpy).toHaveBeenCalledWith("Skill 'test-skill' is already registered. Overwriting.");
        consoleSpy.mockRestore();
    });

    it('should return undefined for unknown skill', () => {
        expect(registry.get('unknown')).toBeUndefined();
    });

    it('should return all skills', () => {
        const skill2 = { ...mockSkill, name: 'skill2' };
        registry.register(mockSkill);
        registry.register(skill2);
        expect(registry.getAll()).toHaveLength(2);
        expect(registry.getAll()).toContain(mockSkill);
        expect(registry.getAll()).toContain(skill2);
    });

    describe('load', () => {
        it('should do nothing if directory does not exist', async () => {
            const nonExistentDir = path.join(tempDir, 'non-existent');
            await registry.load(nonExistentDir);
            // Should not throw
        });

        it('should load valid skills', async () => {
            const skillContent = `
                export class ValidSkill {
                    constructor(core) {
                        this.name = 'valid-skill';
                        this.description = 'Valid Skill';
                    }
                    isSupported() { return true; }
                    execute() {}
                }
            `;
            fs.writeFileSync(path.join(tempDir, 'ValidSkill.js'), skillContent);

            await registry.load(tempDir);

            expect(registry.get('valid-skill')).toBeDefined();
        });

        it('should identify default skill (cli)', async () => {
            const skillContent = `
                export class CLISkill {
                    constructor(core) {
                        this.name = 'cli';
                        this.description = 'CLI Skill';
                    }
                    isSupported() { return true; }
                    execute() {}
                }
            `;
            fs.writeFileSync(path.join(tempDir, 'CLISkill.js'), skillContent);

            await registry.load(tempDir);

            expect(registry.getDefault()?.name).toBe('cli');
        });

        it('should ignore non-skill files', async () => {
            fs.writeFileSync(path.join(tempDir, 'readme.txt'), 'This is not a skill');
            await registry.load(tempDir);
            expect(registry.getAll()).toHaveLength(0);
        });

        it('should handle import errors', async () => {
            // Create a file with invalid syntax to cause import error
            fs.writeFileSync(path.join(tempDir, 'ErrorSkill.js'), "throw new Error('Import failed');");

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

            await registry.load(tempDir);

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to load skill'), expect.any(Error));
            consoleSpy.mockRestore();
        });

        it('should ignore invalid skill classes', async () => {
            const skillContent = `
                export class InvalidSkill {
                    constructor(core) {
                        // Missing name, isSupported
                    }
                }
            `;
            fs.writeFileSync(path.join(tempDir, 'InvalidSkill.js'), skillContent);

            await registry.load(tempDir);
            expect(registry.getAll()).toHaveLength(0);
        });

        it('should ignore skills that throw on instantiation', async () => {
            const skillContent = `
                export class BrokenSkill {
                    constructor(core) {
                        throw new Error('Broken constructor');
                    }
                }
            `;
            fs.writeFileSync(path.join(tempDir, 'BrokenSkill.js'), skillContent);
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

        it('should ignore unsupported skills', async () => {
            const skillContent = `
                 export class UnsupportedSkill {
                     constructor(core) {
                         this.name = 'unsupported';
                     }
                     isSupported() { return false; }
                     execute() {}
                 }
             `;
            fs.writeFileSync(path.join(tempDir, 'UnsupportedSkill.js'), skillContent);

            await registry.load(tempDir);
            expect(registry.get('unsupported')).toBeUndefined();
        });
    });
});
