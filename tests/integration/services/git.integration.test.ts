import { jest, describe, it, beforeEach, afterEach, beforeAll, afterAll, expect } from '@jest/globals';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { spawnSync } from 'child_process';
import { GitService } from '../../../src/services/GitService.js';
import { Orchestrator } from '../../../src/orchestrator.js';

describe('GitService Integration Tests', () => {
    let gitService: GitService;
    let tempDir: string;
    let originalCwd: string;
    let orchestrator: Orchestrator;

    beforeAll(async () => {
        originalCwd = process.cwd();
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nexical-git-test-'));

        // Initialize git repo
        spawnSync('git', ['init'], { cwd: tempDir });
        spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tempDir });
        spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tempDir });

        // Change CWD
        process.chdir(tempDir);
    });

    afterAll(async () => {
        process.chdir(originalCwd);
        await fs.remove(tempDir);
    });

    beforeEach(() => {
        orchestrator = new Orchestrator({ workingDirectory: process.cwd() });
        // Force project path to temp dir
        orchestrator.config.projectPath = tempDir;
        gitService = new GitService(orchestrator);
    });

    it('should commit changes', async () => {
        const testFile = path.join(tempDir, 'test.txt');
        await fs.writeFile(testFile, 'hello world');

        gitService.add('test.txt');
        gitService.commit('Initial commit');

        const result = spawnSync('git', ['log', '-1', '--pretty=%B'], { cwd: tempDir, encoding: 'utf-8' });
        expect(result.stdout.trim()).toBe('Initial commit');
    });

    it('should get current branch', async () => {
        // Default branch might be master or main depending on git config
        // Let's force it to main
        spawnSync('git', ['checkout', '-b', 'main'], { cwd: tempDir });

        const branch = gitService.getCurrentBranch();
        expect(branch).toBe('main');
    });
});
