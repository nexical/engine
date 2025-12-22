import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ProjectProfile } from '../../../src/domain/ProjectProfile.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('ProjectProfile', () => {
    let tmpDir: string;
    let configPath: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexical-test-'));
        configPath = path.join(tmpDir, 'config.yml');
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should load profile from yaml', () => {
        const yamlContent = 'name: test-project\nversion: 1.0.0';
        fs.writeFileSync(configPath, yamlContent);

        const profile = ProjectProfile.load(configPath);
        expect(profile.name).toBe('test-project');
        expect(profile.version).toBe('1.0.0');
    });

    it('should return empty profile if file not exists', () => {
        const profile = ProjectProfile.load(path.join(tmpDir, 'non-existent.yml'));
        expect(profile).toBeInstanceOf(ProjectProfile);
        // It might have other properties if I added defaults? No, just assigned from object.
        // It returns `new ProjectProfile()`.
        expect(Object.keys(profile)).toEqual([]);
    });

    it('should handle complex yaml', () => {
        const yamlContent = `
name: complex-project
settings:
    theme: dark
    modules:
        - auth
        - payments
`;
        fs.writeFileSync(configPath, yamlContent);
        const profile = ProjectProfile.load(configPath);
        expect(profile.name).toBe('complex-project');
        expect(profile.settings.theme).toBe('dark');
        expect(profile.settings.modules).toContain('auth');
    });
});
