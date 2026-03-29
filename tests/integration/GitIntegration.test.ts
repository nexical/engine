/**
 * @file GitIntegration.test.ts
 *
 * SCOPE:
 * This test verifies the integration between the Executor and the Version Control System (Git).
 * It ensures that the agent automatically initializes a repo (if needed) and creates commits
 * after successful task execution.
 *
 * COVERAGE:
 * - GitService integration.
 * - Executor post-execution hooks.
 * - Automatic commit message generation.
 */

import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

import { IDriverContext } from '../../src/domain/Driver.js';
import { Result } from '../../src/domain/Result.js';
import { DriverConfig } from '../../src/domain/SkillConfig.js';
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
    await fixture.writeSkill('executor', { name: 'executor', execution: { provider: 'gemini' } });

    const orchestrator = await fixture.initOrchestrator();

    fixture.registerMockDriver(
      'gemini',
      async (config: DriverConfig, options?: IDriverContext): Promise<Result<string, Error>> => {
        const pTemplate = config.prompt_template as string;
        if (pTemplate?.includes('Software Architect'))
          return Promise.resolve(Result.ok(ProjectFixture.createArchitectResult()));
        if (pTemplate?.includes('expert AI Planner')) {
          return Promise.resolve(
            Result.ok(
              ProjectFixture.createPlanResult([{ id: 't1', skill: 'executor', message: 'exec', description: 'desc' }]),
            ),
          );
        }
        // If it's the executor, the prompt template might be undefined or different, but we know it's executor if it's not the other two, or checking the task id
        const workspaceDir = options?.workspaceRoot as string;
        if (workspaceDir && (options?.params as Record<string, unknown>)?.task_id === 't1') {
          fs.writeFileSync(path.join(workspaceDir, 'integration_test_file.txt'), 'done');
          return Promise.resolve(Result.ok('Executed'));
        }
        return Promise.resolve(Result.ok('OK'));
      },
    );

    await orchestrator.start('Git integration test');
    if (orchestrator.session.state.status === 'FAILED') {
      // eslint-disable-next-line no-console
      console.error('Workflow Failed with Error:', orchestrator.session.state.error);
    }
    expect(orchestrator.session.state.status).toBe('COMPLETED');

    // Verify commit was made via exec (simplest integration check)
    const log = execSync('git log -n 5 --oneline', execOptions).toString();
    expect(log).toMatch(/Task complete: t1/);
  });
});
