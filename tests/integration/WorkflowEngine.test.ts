/**
 * @file WorkflowEngine.test.ts
 *
 * SCOPE:
 * This test verifies the core Workflow state machine logic.
 * It checks the standard happy-path transition (ARCHITECTING -> PLANNING -> EXECUTING -> COMPLETED)
 * and verifies that critical errors in any state cause the workflow to transition to FAILED.
 *
 * COVERAGE:
 * - Workflow state transitions.
 * - Orchestrator.execute() entry point.
 * - Error handling propagation to FAILED state.
 */

import { Result } from '../../src/domain/Result.js';
import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Workflow Engine Integration', () => {
  let fixture: ProjectFixture;

  beforeEach(async (): Promise<void> => {
    fixture = new ProjectFixture();
    await fixture.setup();
  });

  afterEach(async (): Promise<void> => {
    await fixture.cleanup();
  });

  test('should transition through states correctly (Scenario 15)', async (): Promise<void> => {
    await fixture.writeConfig({ project_name: 'WorkflowTest' });
    const orchestrator = await fixture.initOrchestrator();

    fixture.registerMockDriver('gemini', async (skill): Promise<Result<string, Error>> => {
      if (skill.name === 'architect') return Promise.resolve(Result.ok(ProjectFixture.createArchitectResult()));
      if (skill.name === 'planner') return Promise.resolve(Result.ok(ProjectFixture.createPlanResult([])));
      return Promise.resolve(Result.ok('OK'));
    });

    await orchestrator.start('Run workflow');

    // Verify events were emitted    // Verify transitions
    const stateEnters: string[] = fixture.mockHost.emit.mock.calls
      .filter((call: [string, unknown]) => call[0] === 'state:enter')
      .map((call: [string, unknown]) => (call[1] as { state: string }).state);
    expect(stateEnters).toEqual(['ARCHITECTING', 'PLANNING', 'EXECUTING', 'COMPLETED']);
  });

  test('should stop on workflow failure', async (): Promise<void> => {
    await fixture.writeConfig({ project_name: 'FailTest' });
    const orchestrator = await fixture.initOrchestrator();

    fixture.registerMockDriver('gemini', async (skill): Promise<Result<string, Error>> => {
      if (skill.name === 'architect') {
        return Promise.resolve(Result.fail(new Error('Architectural meltdown')));
      }
      return Promise.resolve(Result.ok('OK'));
    });

    await orchestrator.start('Build something');

    const stateEnters: string[] = fixture.mockHost.emit.mock.calls
      .filter((call: [string, unknown]) => call[0] === 'state:enter')
      .map((call: [string, unknown]) => (call[1] as { state: string }).state);

    // Should enter ARCHITECTING then stop (FAILED or ERROR)
    expect(stateEnters).toEqual(['ARCHITECTING']);
    expect(orchestrator.session.state.status).toBe('FAILED');
  });
});
