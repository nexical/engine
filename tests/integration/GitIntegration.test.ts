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

import { jest } from '@jest/globals';

import { GitService } from '../../src/services/GitService.js';
import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Git Integration Integration', () => {
  let fixture: ProjectFixture;

  beforeEach(async () => {
    fixture = new ProjectFixture();
    await fixture.setup();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  test('should commit changes after each successful developer task', async () => {
    await fixture.writeConfig({ project_name: 'GitTest' });
    await fixture.writeSkill('developer', { name: 'developer', provider: 'gemini' });

    const orchestrator = await fixture.initOrchestrator();

    // 1. Initialize real git in the temp directory (requires real git installed)
    // We can use the real GitService for this setup part
    const git = new GitService(fixture.mockHost, fixture.tmpDir);
    git.init();
    // Set dummy user for git
    git.runCommand(['config', 'user.email', 'test@example.com']);
    git.runCommand(['config', 'user.name', 'Test User']);

    fixture.registerMockDriver('gemini', async (skill: any) => {
      if (skill.name === 'architect') {
        return { isFail: () => false, unwrap: () => ProjectFixture.createArchitectResult(), error: () => null };
      }
      if (skill.name === 'planner') {
        return {
          isFail: () => false,
          unwrap: () =>
            ProjectFixture.createPlanResult([
              { id: 'g1', skill: 'developer', message: 'git-task', description: 'desc' },
            ]),
          error: () => null,
        };
      }
      return { isFail: () => false, unwrap: () => 'OK', error: () => null };
    });

    await orchestrator.start('Git commit test');

    expect(orchestrator.session.state.status).toBe('COMPLETED');

    // 2. Verify git log contains the task completion message
    const log = git.runCommand(['log', '--oneline']);
    expect(log).toContain('[nexical] Completed task: g1 - git-task');
  });
});
