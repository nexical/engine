/**
 * @file SkillFailure.test.ts
 *
 * SCOPE:
 * This test verifies the system's resilience to errors during skill execution.
 * It specifically checks how the workflow handles missing providers, driver execution failures,
 * and prompt template rendering errors.
 *
 * COVERAGE:
 * - SkillRunner error handling.
 * - Missing provider detection.
 * - Prompt template syntax error recovery.
 * - Driver execution exception handling.
 */

import { jest } from '@jest/globals';

import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Skill Failure Integration', () => {
  let fixture: ProjectFixture;

  beforeEach(async () => {
    fixture = new ProjectFixture();
    await fixture.setup();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  test('should fail workflow if a required skill provider is missing', async () => {
    await fixture.writeConfig({ project_name: 'SkillFailTest' });
    // Skill uses 'missing-driver' provider which won't be registered
    await fixture.writeSkill('developer', { name: 'developer', provider: 'missing-driver' });

    const orchestrator = await fixture.initOrchestrator();

    fixture.registerMockDriver('gemini', async (skill: any) => {
      if (skill.name === 'architect') {
        return { isFail: () => false, unwrap: () => ProjectFixture.createArchitectResult(), error: () => null };
      }
      if (skill.name === 'planner') {
        return { isFail: () => false, unwrap: () => ProjectFixture.createPlanResult(), error: () => null };
      }
      return { isFail: () => false, unwrap: () => 'OK', error: () => null };
    });

    await orchestrator.start('Missing provider test');

    expect(orchestrator.session.state.status).toBe('FAILED');
    expect(fixture.mockHost.log).toHaveBeenCalledWith(
      'error',
      expect.stringContaining("Driver 'missing-driver' not found"),
    );
  });

  test('should fail workflow if driver execution fails', async () => {
    await fixture.writeConfig({ project_name: 'ExecFailTest' });
    await fixture.writeSkill('developer', { name: 'developer', provider: 'gemini' });

    const orchestrator = await fixture.initOrchestrator();

    fixture.registerMockDriver('gemini', async (skill: any) => {
      if (skill.name === 'architect') {
        return { isFail: () => false, unwrap: () => ProjectFixture.createArchitectResult(), error: () => null };
      }
      if (skill.name === 'planner') {
        return { isFail: () => false, unwrap: () => ProjectFixture.createPlanResult(), error: () => null };
      }
      if (skill.name === 'developer') {
        return { isFail: () => true, unwrap: () => '', error: () => new Error('Simulated Driver Failure') };
      }
      return { isFail: () => false, unwrap: () => 'OK', error: () => null };
    });

    await orchestrator.start('Driver failure test');

    expect(orchestrator.session.state.status).toBe('FAILED');
    expect(fixture.mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Simulated Driver Failure'));
  });

  test('should fail workflow if skill template rendering fails', async () => {
    await fixture.writeConfig({ project_name: 'RenderFailTest' });
    await fixture.writeSkill('developer', { name: 'developer', provider: 'gemini' });

    // Write a template that will fail to render (unclosed tag)
    await fixture.writePrompt('skill.md', 'Bad Template {{ unclosed');

    const orchestrator = await fixture.initOrchestrator();

    fixture.registerMockDriver('gemini', async (skill: any) => {
      if (skill.name === 'architect') {
        return { isFail: () => false, unwrap: () => ProjectFixture.createArchitectResult(), error: () => null };
      }
      if (skill.name === 'planner') {
        return { isFail: () => false, unwrap: () => ProjectFixture.createPlanResult(), error: () => null };
      }
      return { isFail: () => false, unwrap: () => 'OK', error: () => null };
    });

    await orchestrator.start('Template failure test');

    // console.log('DEBUG LOG CALLS:', JSON.stringify(fixture.mockHost.log.mock.calls, null, 2));

    expect(orchestrator.session.state.status).toBe('FAILED');
    expect(fixture.mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Error rendering template'));
  });
});
