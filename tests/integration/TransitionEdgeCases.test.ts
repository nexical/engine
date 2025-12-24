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

import { jest } from '@jest/globals';

import { SignalDetectedError } from '../../src/errors/SignalDetectedError.js';
import { Signal } from '../../src/workflow/Signal.js';
import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Workflow Transition Edge Cases', () => {
  let fixture: ProjectFixture;

  beforeEach(async () => {
    fixture = new ProjectFixture();
    fixture.mockHost.log.mockImplementation((level: string, msg: string) => {
      console.log(`[TEST ${level.toUpperCase()}] ${msg}`);
    });
    await fixture.setup();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  test('should transition from PLANNING back to ARCHITECTING on REARCHITECT signal', async () => {
    await fixture.writeConfig({ project_name: 'EdgeCase' });
    await fixture.writeSkill('developer', { name: 'developer', provider: 'gemini' });
    const orchestrator = await fixture.initOrchestrator();

    let rearchitected = false;

    fixture.registerMockDriver('gemini', async (skill: any) => {
      if (skill.name === 'architect') {
        return { isFail: () => false, unwrap: () => ProjectFixture.createArchitectResult(), error: () => null };
      }
      if (skill.name === 'planner') {
        return { isFail: () => false, unwrap: () => ProjectFixture.createPlanResult(), error: () => null };
      }
      return { isFail: () => false, unwrap: () => 'OK', error: () => null };
    });

    // Trigger REARCHITECT via interaction
    fixture.mockHost.ask.mockImplementation(async (msg: string) => {
      if (msg.includes('Plan generated') && !rearchitected) {
        rearchitected = true;
        return 'rearchitect: need more details';
      }
      return 'yes';
    });

    orchestrator.session.state.interactive = true;
    await orchestrator.start('Build it');

    const stateEnters = fixture.mockHost.emit.mock.calls
      .filter((call: any) => call[0] === 'state:enter')
      .map((call: any) => call[1].state);

    // Sequence: ARCHITECTING -> PLANNING -> ARCHITECTING (re-entry) -> PLANNING -> EXECUTING -> COMPLETED
    expect(stateEnters).toContain('ARCHITECTING');
    expect(stateEnters.filter((s: string) => s === 'ARCHITECTING').length).toBe(2);
    expect(orchestrator.session.state.status).toBe('COMPLETED');
  });

  test('should transition from EXECUTING to ARCHITECTING on REARCHITECT signal', async () => {
    await fixture.writeConfig({ project_name: 'EdgeCaseExec' });
    await fixture.writeSkill('developer', { name: 'developer', provider: 'gemini' });
    const orchestrator = await fixture.initOrchestrator();

    let rearchitected = false;

    fixture.registerMockDriver('gemini', async (skill: any) => {
      if (skill.name === 'architect') {
        return { isFail: () => false, unwrap: () => ProjectFixture.createArchitectResult(), error: () => null };
      }
      if (skill.name === 'planner') {
        return { isFail: () => false, unwrap: () => ProjectFixture.createPlanResult(), error: () => null };
      }
      if (skill.name === 'developer') {
        if (!rearchitected) {
          rearchitected = true;
          // Properly use SignalDetectedError
          throw new SignalDetectedError(Signal.rearchitect('Need more structure'));
        }
        return { isFail: () => false, unwrap: () => 'OK', error: () => null };
      }
      return { isFail: () => false, unwrap: () => 'OK', error: () => null };
    });

    await orchestrator.start('Complex task');

    const stateEnters = fixture.mockHost.emit.mock.calls
      .filter((call: any) => call[0] === 'state:enter')
      .map((call: any) => call[1].state);

    // Sequence: ARCHITECTING -> PLANNING -> EXECUTING -> ARCHITECTING -> PLANNING -> EXECUTING -> COMPLETED
    expect(stateEnters.filter((s: string) => s === 'ARCHITECTING').length).toBe(2);
    expect(orchestrator.session.state.status).toBe('COMPLETED');
  });
});
