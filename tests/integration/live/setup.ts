import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import dotenv from 'dotenv';

// Load env vars from root .env
dotenv.config({ path: path.join(process.cwd(), '.env') });

export function getTestProjectRoot(id: string) {
    return path.join(process.cwd(), `test_project_${id}`);
}

export const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'fixtures');

export async function setupTestProject(id: string) {
    const testProjectRoot = getTestProjectRoot(id);
    console.log(`Setting up test project ${id} at:`, testProjectRoot);
    console.log('Fixtures dir:', FIXTURES_DIR);

    // Clean up existing test project if any
    await fs.remove(testProjectRoot);
    await fs.ensureDir(testProjectRoot);

    // Copy fixtures to .nexical directory in test project
    const nexicalDir = path.join(testProjectRoot, '.nexical');
    await fs.ensureDir(nexicalDir);

    // Copy agents
    await fs.copy(path.join(FIXTURES_DIR, 'agents'), path.join(nexicalDir, 'agents'));

    // Copy deploy.yml to root of test project (or .nexical? deploy command usually looks in root or .nexical)
    // Let's check where Orchestrator looks for it. Usually it's expected in the project root or .nexical.
    // Based on previous knowledge, it might be in .nexical/deploy.yml or root deploy.yml.
    // Let's put it in both to be safe or check the code.
    // Copy deploy.yml to .nexical directory (where Orchestrator expects it)
    await fs.copy(path.join(FIXTURES_DIR, 'deploy.yml'), path.join(nexicalDir, 'deploy.yml'));

    // Initialize a git repo because some commands might rely on git
    const { spawnSync } = await import('child_process');
    spawnSync('git', ['init'], { cwd: testProjectRoot });
    spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: testProjectRoot });
    spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: testProjectRoot });

    return testProjectRoot;
}

export async function cleanupTestProject(id: string) {
    const testProjectRoot = getTestProjectRoot(id);
    // await fs.remove(testProjectRoot);
    // Keep it for inspection if failed? Or just clean up.
    // For CI, clean up is good. For local dev, maybe keep it.
    // Let's clean up.
    // await fs.remove(testProjectRoot);
    console.log(`Skipping cleanup for debugging ${id}`);
}
