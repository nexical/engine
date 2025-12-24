/**
 * @file FullSystem.test.ts
 *
 * SCOPE:
 * This test suite provides high-level "smoke tests" for the entire system.
 * It verifies that a standard user request "from scratch" can be processed from start to finish
 * without crashing, utilizing the default mocked drivers. It also checks scalability logic
 * (large payloads).
 *
 * COVERAGE:
 * - Happy path workflow (Start -> Architect -> Plan -> Execute -> Complete).
 * - Large payload handling in drivers and artifacts.
 */

import { jest } from '@jest/globals';
import fs from 'fs-extra';

import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Full System Integration (Smoke Test)', () => {
  let fixture: ProjectFixture;

  beforeEach(async () => {
    fixture = new ProjectFixture();
    await fixture.setup();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  test('should execute full workflow from prompt to success', async () => {
    await fixture.writeConfig({ project_name: 'SmokeTest' });
    await fixture.writeSkill('developer', { name: 'developer', provider: 'gemini' });

    const orchestrator = await fixture.initOrchestrator();

    fixture.registerMockDriver('gemini', async (skill: any) => {
      if (skill.name === 'architect') {
        return { isFail: () => false, unwrap: () => ProjectFixture.createArchitectResult(), error: () => null };
      }
      if (skill.name === 'planner') {
        return {
          isFail: () => false,
          unwrap: () =>
            ProjectFixture.createPlanResult([
              { id: 'task1', skill: 'developer', message: 'work', description: 'desc' },
            ]),
          error: () => null,
        };
      }
      return { isFail: () => false, unwrap: () => 'OK', error: () => null };
    });

    await orchestrator.start('Build a landing page');

    expect(orchestrator.session.state.status).toBe('COMPLETED');
    expect(orchestrator.session.state.tasks.completed).toContain('task1');
  });

  test('should handle large payloads correctly (Scenario 16)', async () => {
    await fixture.writeConfig({ project_name: 'LargePayloadTest' });
    await fixture.writeSkill('developer', { name: 'developer', provider: 'gemini' });

    const orchestrator = await fixture.initOrchestrator();

    // Create a large architecture result (e.g. 100 components)
    const components = Array.from({ length: 100 }, (_, i) => `Component ${i}`);
    const largeArchitecture = ProjectFixture.createArchitectResult(components);

    // Create a large plan (e.g. 50 tasks)
    const tasks = Array.from({ length: 50 }, (_, i) => ({
      id: `task-${i}`,
      skill: 'developer',
      message: `Doing task ${i}`,
      description: `Work for task ${i}`,
      params: {},
    }));
    const largePlan = ProjectFixture.createPlanResult(tasks);

    fixture.registerMockDriver('gemini', async (skill: any) => {
      if (skill.name === 'architect')
        return { isFail: () => false, unwrap: () => largeArchitecture, error: () => null };
      if (skill.name === 'planner') return { isFail: () => false, unwrap: () => largePlan, error: () => null };
      return { isFail: () => false, unwrap: () => 'OK', error: () => null };
    });

    await orchestrator.start('Large prompt');

    expect(orchestrator.session.state.status).toBe('COMPLETED');
    expect(orchestrator.session.state.tasks.completed.length).toBe(50);

    // Final state should be persistable
    const stateFile = orchestrator.project.paths.state;
    expect(fs.existsSync(stateFile)).toBe(true);
    const stateContent = fs.readFileSync(stateFile, 'utf8');
    expect(stateContent.length).toBeGreaterThan(1000);
  });
});
