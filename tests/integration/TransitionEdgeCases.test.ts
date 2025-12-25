/**
 * @file TransitionEdgeCases.test.ts
 *
 * SCOPE:
 * This test verifies complex and non-standard state transitions within the workflow.
 * It focuses on "Backtracking" signals like REARCHITECT occurring from later states
 * (PLANNING and EXECUTING), ensuring the system correctly rewinds to the ARCHITECTING state.
 *
 * COVERAGE:
 * - Signal.REARCHITECT handling.
 * - State machine backtracking logic.
 * - SignalDetectedError propagation from deep within agents.
 */

import { Result } from '../../src/domain/Result.js';
import { DriverConfig } from '../../src/domain/SkillConfig.js';
import { SignalDetectedError } from '../../src/errors/SignalDetectedError.js';
import { Signal } from '../../src/workflow/Signal.js';
import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Workflow Transition Edge Cases', () => {
  let fixture: ProjectFixture;

  beforeEach(async (): Promise<void> => {
    fixture = new ProjectFixture();
    fixture.mockHost.log.mockImplementation((level: string, msg: string): void => {
      process.stdout.write(`[TEST ${level.toUpperCase()}] ${msg}\n`);
    });
    await fixture.setup();
  });

  afterEach(async (): Promise<void> => {
    await fixture.cleanup();
  });

  test('should transition from PLANNING back to ARCHITECTING on REARCHITECT signal', async (): Promise<void> => {
    await fixture.writeConfig({ project_name: 'EdgeCase' });
    await fixture.writeSkill('executor', { name: 'executor', provider: 'gemini' });
    const orchestrator = await fixture.initOrchestrator();

    let rearchitected = false;

    fixture.registerMockDriver('gemini', async (config: DriverConfig): Promise<Result<string, Error>> => {
      if (config.provider === 'architect') {
        return Promise.resolve(Result.ok(ProjectFixture.createArchitectResult()));
      }
      if (config.provider === 'planner') {
        return Promise.resolve(Result.ok(ProjectFixture.createPlanResult()));
      }
      return Promise.resolve(Result.ok('OK'));
    });

    // Trigger REARCHITECT via interaction
    fixture.mockHost.ask.mockImplementation(async (msg: string): Promise<string> => {
      if (msg.includes('Plan generated') && !rearchitected) {
        rearchitected = true;
        return Promise.resolve('rearchitect: need more details');
      }
      return Promise.resolve('yes');
    });

    orchestrator.session.state.interactive = true;
    await orchestrator.start('Build it');

    const stateEnters: string[] = fixture.mockHost.emit.mock.calls
      .filter((call: [string, unknown]) => call[0] === 'state:enter')
      .map((call: [string, unknown]) => (call[1] as { state: string }).state);

    // Sequence: ARCHITECTING -> PLANNING -> ARCHITECTING (re-entry) -> PLANNING -> EXECUTING -> COMPLETED
    expect(stateEnters).toContain('ARCHITECTING');
    expect(stateEnters.filter((s: string) => s === 'ARCHITECTING').length).toBe(2);
    expect(orchestrator.session.state.status).toBe('COMPLETED');
  });

  test('should transition from EXECUTING to ARCHITECTING on REARCHITECT signal', async (): Promise<void> => {
    await fixture.writeConfig({ project_name: 'EdgeCaseExec' });
    await fixture.writeSkill('executor', { name: 'executor', provider: 'gemini' });
    const orchestrator = await fixture.initOrchestrator();

    let rearchitected = false;

    fixture.registerMockDriver('gemini', async (config: DriverConfig): Promise<Result<string, Error>> => {
      if (config.provider === 'architect') {
        return Promise.resolve(Result.ok(ProjectFixture.createArchitectResult()));
      }
      if (config.provider === 'planner') {
        return Promise.resolve(Result.ok(ProjectFixture.createPlanResult()));
      }
      if (config.provider === 'executor') {
        if (!rearchitected) {
          rearchitected = true;
          // Properly use SignalDetectedError
          throw new SignalDetectedError(Signal.rearchitect('Need more structure'));
        }
        return Promise.resolve(Result.ok('OK'));
      }
      return Promise.resolve(Result.ok('OK'));
    });

    await orchestrator.start('Complex task');

    // Verify state cycles
    const stateEnters: string[] = fixture.mockHost.emit.mock.calls
      .filter((call: [string, unknown]) => call[0] === 'state:enter')
      .map((call: [string, unknown]) => (call[1] as { state: string }).state);

    // Sequence: ARCHITECTING -> PLANNING -> EXECUTING -> ARCHITECTING -> PLANNING -> EXECUTING -> COMPLETED
    expect(stateEnters.filter((s: string) => s === 'ARCHITECTING').length).toBe(2);
    expect(orchestrator.session.state.status).toBe('COMPLETED');
  });
});
