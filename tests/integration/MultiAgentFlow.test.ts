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

import { IDriverContext } from '../../src/domain/Driver.js';
import { Result } from '../../src/domain/Result.js';
import { DriverConfig } from '../../src/domain/SkillConfig.js';
import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Multi-Agent Flow Integration', () => {
  let fixture: ProjectFixture;

  beforeEach(async (): Promise<void> => {
    fixture = new ProjectFixture();
    await fixture.setup();
  });

  afterEach(async (): Promise<void> => {
    await fixture.cleanup();
  });

  test('should pass state between agents and inject config variables (Scenario 11 & 13)', async (): Promise<void> => {
    await fixture.writePrompt(
      'architect.md',
      'Architect for {{ project_name }} in {{ environment }}. Skills: {{ available_skills }}',
    );
    await fixture.writePrompt('planner.md', 'Planner for {{ project_name }}');

    // Write missing skills
    await fixture.writeSkill('architect', { name: 'architect', execution: { provider: 'architect' } });
    await fixture.writeSkill('planner', { name: 'planner', execution: { provider: 'planner' } });
    await fixture.writeSkill('executor', { name: 'executor', execution: { provider: 'gemini' } });
    await fixture.writeConfig({ environment: 'staging', project_name: 'MultiTest' });

    const orchestrator = await fixture.initOrchestrator();

    const mockDriverImpl = async (
      config: DriverConfig,
      options: IDriverContext | undefined,
    ): Promise<Result<string, Error>> => {
      // Logic for each agent type based on provider (or use config.type if preferred, but existing code used provider)
      if (config.provider === 'architect') {
        const params = options?.params as Record<string, unknown>;
        const projectName = params?.project_name as string;

        const environment = params?.environment as string;
        expect(projectName).toContain('MultiTest');
        expect(environment).toContain('staging');
        return Promise.resolve(Result.ok(ProjectFixture.createArchitectResult()));
      }
      if (config.provider === 'planner') {
        const planResult = ProjectFixture.createPlanResult([
          { id: 'task1', skill: 'executor', message: 'work', description: 'work_description' },
        ]);
        return Promise.resolve(Result.ok(planResult));
      }
      return Promise.resolve(Result.ok('OK'));
    };

    fixture.registerMockDriver('gemini', mockDriverImpl);
    fixture.registerMockDriver('architect', mockDriverImpl);
    fixture.registerMockDriver('planner', mockDriverImpl);

    await orchestrator.start('Build something');

    expect(orchestrator.session.state.status).toBe('COMPLETED');
    expect(orchestrator.session.state.tasks.completed).toContain('task1');
  });
});
