/**
 * @file WorkflowRobustness.test.ts
 *
 * SCOPE:
 * This test verifies the stability and safety mechanisms of the workflow engine.
 * It includes tests for infinite loop detection (maxLoops), handling of external interruption signals
 * (file-based signals), and recovering/retreating from execution to planning.
 *
 * COVERAGE:
 * - Infinite loop protection (maxLoops).
 * - External signal detection (via Workspace).
 * - EXECUTING -> PLANNING retreat logic.
 */

import { jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';

import { SignalDetectedError } from '../../src/errors/SignalDetectedError.js';
import { Signal } from '../../src/workflow/Signal.js';
import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Workflow Robustness Integration', () => {
  let fixture: ProjectFixture;

  beforeEach(async () => {
    fixture = new ProjectFixture();
    await fixture.setup();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  test('should terminate after maxLoops (Scenario 3)', async () => {
    // Set a low maxLoops to speed up the test
    await fixture.writeConfig({
      project_name: 'LoopTest',
      maxLoops: 3,
    });
    const orchestrator = await fixture.initOrchestrator();

    // Mock Architect to always return failing signal via error
    fixture.registerMockDriver('gemini', async () => {
      throw new Error('Infinite loop trigger');
    });

    await orchestrator.start('Loop me');

    expect(orchestrator.session.state.loop_count).toBeGreaterThan(0);
    expect(orchestrator.session.state.status).toBe('FAILED');
  });

  test('should retreat to PLANNING from EXECUTING when SignalDetectedError:REPLAN occurs (Scenario 8)', async () => {
    await fixture.writeConfig({ project_name: 'RetreatTest' });
    await fixture.writeSkill('developer', { name: 'developer', provider: 'gemini' });
    const orchestrator = await fixture.initOrchestrator();

    let firstExec = true;

    fixture.registerMockDriver('gemini', async (skill: any) => {
      if (skill.name === 'architect')
        return { isFail: () => false, unwrap: () => ProjectFixture.createArchitectResult(), error: () => null };
      if (skill.name === 'planner')
        return {
          isFail: () => false,
          unwrap: () =>
            ProjectFixture.createPlanResult([{ id: 't1', skill: 'developer', message: 'msg', description: 'desc' }]),
          error: () => null,
        };
      if (skill.name === 'developer') {
        if (firstExec) {
          firstExec = false;
          throw new SignalDetectedError(Signal.replan('Need better plan'));
        }
        return { isFail: () => false, unwrap: () => 'OK', error: () => null };
      }
      return { isFail: () => false, unwrap: () => 'OK', error: () => null };
    });

    await orchestrator.start('Retreat Test');

    const stateEnters = fixture.mockHost.emit.mock.calls
      .filter((call: any) => call[0] === 'state:enter')
      .map((call: any) => call[1].state);

    // Sequence: ARCHITECTING -> PLANNING -> EXECUTING -> PLANNING -> EXECUTING -> COMPLETED
    expect(stateEnters).toEqual(['ARCHITECTING', 'PLANNING', 'EXECUTING', 'PLANNING', 'EXECUTING', 'COMPLETED']);
    expect(orchestrator.session.state.status).toBe('COMPLETED');
  });

  test('should interrupt execution when an external signal is detected (Scenario 14)', async () => {
    await fixture.writeConfig({ project_name: 'InterruptTest' });
    await fixture.writeSkill('developer', { name: 'developer', provider: 'gemini' });
    const orchestrator = await fixture.initOrchestrator();

    fixture.registerMockDriver('gemini', async (skill: any) => {
      if (skill.name === 'architect')
        return { isFail: () => false, unwrap: () => ProjectFixture.createArchitectResult(), error: () => null };
      if (skill.name === 'planner')
        return {
          isFail: () => false,
          unwrap: () =>
            ProjectFixture.createPlanResult([{ id: 't1', skill: 'developer', message: 'msg', description: 'desc' }]),
          error: () => null,
        };
      if (skill.name === 'developer') {
        // Create a signal file mid-flow
        const signalPath = path.join(fixture.tmpDir, '.ai/signals/interrupt.signal.yaml');
        await fs.ensureDir(path.dirname(signalPath));
        await fs.writeFile(signalPath, 'type: REPLAN\nreason: User changed mind');
        return { isFail: () => false, unwrap: () => 'OK', error: () => null };
      }
      return { isFail: () => false, unwrap: () => 'OK', error: () => null };
    });

    await orchestrator.start('Run flow');

    const stateEnters = fixture.mockHost.emit.mock.calls
      .filter((call: any) => call[0] === 'state:enter')
      .map((call: any) => call[1].state);

    expect(stateEnters).toContain('PLANNING');
    expect(orchestrator.session.state.status).toBe('COMPLETED');
  });
});
