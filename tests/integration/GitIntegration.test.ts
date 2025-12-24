/**
 * @file GitIntegration.test.ts
 *
 * SCOPE:
 * This test verifies the integration between the DeveloperAgent and the Version Control System (Git).
 * It ensures that the agent automatically initializes a repo (if needed) and creates commits
 * after successful task execution.
 *
 * COVERAGE:
 * - GitService integration.
 * - DeveloperAgent post-execution hooks.
 * - Automatic commit message generation.
 */

import { execSync } from 'child_process';

import { Result } from '../../src/domain/Result.js';
import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Git Integration', () => {
  let fixture: ProjectFixture;

  beforeEach(async (): Promise<void> => {
    fixture = new ProjectFixture();
    await fixture.setup();
  });

  afterEach(async (): Promise<void> => {
    await fixture.cleanup();
  });

  test('should initialize git and commit shared content (Scenario 3)', async (): Promise<void> => {
    // 1. Setup git in the tmp directory correctly
    const realTmpDir = fixture.tmpDir;
    const cleanEnv = { ...process.env };
    const keysToRemove = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX'];
    for (const key of keysToRemove) {
      delete cleanEnv[key];
    }
    const execOptions = { cwd: realTmpDir, env: cleanEnv };

    execSync(
      'git init && git config user.email "test@example.com" && git config user.name "Test User" && touch initial && git add . && git commit -m "initial"',
      execOptions,
    );

    await fixture.writeConfig({ project_name: 'GitTest' });
    await fixture.writeSkill('developer', { name: 'developer', provider: 'gemini' });

    const orchestrator = await fixture.initOrchestrator();

    fixture.registerMockDriver('gemini', async (skill: { name: string }): Promise<Result<string, Error>> => {
      if (skill.name === 'architect') return Promise.resolve(Result.ok(ProjectFixture.createArchitectResult()));
      if (skill.name === 'planner') {
        return Promise.resolve(
          Result.ok(
            ProjectFixture.createPlanResult([
              { id: 't1', skill: 'developer', message: 'Execute task', description: 'description' },
            ]),
          ),
        );
      }
      if (skill.name === 'developer') {
        const fs = await import('node:fs');
        const path = await import('node:path');
        fs.writeFileSync(path.join(fixture.tmpDir, 'task_done.txt'), 'done');
        return Promise.resolve(Result.ok('OK'));
      }
      return Promise.resolve(Result.ok('OK'));
    });

    await orchestrator.start('Git integration test');

    // Verify commit was made via exec (simplest integration check)
    const log = execSync('git log -n 5 --oneline', { cwd: fixture.tmpDir }).toString();
    expect(log).toMatch(/Task complete: t1/);
  });
});
