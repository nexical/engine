/**
 * @file MultiAgentFlow.test.ts
 *
 * SCOPE:
 * This test verifies the end-to-end flow between multiple agents (Architect -> Planner -> Developer).
 * It focuses on context propagation (project name, environment variables) through the prompt chain
 * and ensures that config variables are correctly injected into agent prompts.
 *
 * COVERAGE:
 * - Multi-agent orchestration.
 * - Prompt variable injection (PromptEngine).
 * - Configuration context passing.
 */

import { jest } from '@jest/globals';

import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Multi-Agent Flow Integration', () => {
  let fixture: ProjectFixture;

  beforeEach(async () => {
    fixture = new ProjectFixture();
    fixture.mockHost.log.mockImplementation((level: string, msg: string) => {
      if (level === 'error') console.error(`[ORCHESTRATOR ERROR] ${msg}`);
      else console.log(`[ORCHESTRATOR ${level.toUpperCase()}] ${msg}`);
    });
    await fixture.setup();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  test('should pass state between agents and inject config variables (Scenario 11 & 13)', async () => {
    await fixture.writePrompt(
      'architect.md',
      'Architect for {{ project_name }} in {{ environment }}. Skills: {{ available_skills }}',
    );
    await fixture.writePrompt('planner.md', 'Planner for {{ project_name }}');

    await fixture.writeSkill('developer', { name: 'developer', provider: 'gemini' });
    await fixture.writeConfig({ environment: 'staging', project_name: 'MultiTest' });

    const orchestrator = await fixture.initOrchestrator();

    fixture.registerMockDriver('gemini', async (skill: any, options: any) => {
      if (skill.name === 'architect') {
        expect(options.params.prompt).toContain('MultiTest');
        expect(options.params.prompt).toContain('staging');
        return { isFail: () => false, unwrap: () => ProjectFixture.createArchitectResult(), error: () => null };
      }
      if (skill.name === 'planner') {
        const planResult = await ProjectFixture.createPlanResult([
          { id: 'task1', skill: 'developer', message: 'work', description: 'work_description' },
        ]);
        return { isFail: () => false, unwrap: () => planResult, error: () => null };
      }
      return { isFail: () => false, unwrap: () => 'OK', error: () => null };
    });

    await orchestrator.start('Build something');

    expect(orchestrator.session.state.status).toBe('COMPLETED');
    expect(orchestrator.session.state.tasks.completed).toContain('task1');
  });
});
