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

import fs from 'fs-extra';
import path from 'path';

import { ISkill } from '../../src/domain/Driver.js';
import { Result } from '../../src/domain/Result.js';
import { SignalDetectedError } from '../../src/errors/SignalDetectedError.js';
import { Signal } from '../../src/workflow/Signal.js';
import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Workflow Robustness Integration', () => {
  let fixture: ProjectFixture;

  beforeEach(async (): Promise<void> => {
    fixture = new ProjectFixture();
    await fixture.setup();
  });

  afterEach(async (): Promise<void> => {
    await fixture.cleanup();
  });

  test('should terminate after maxLoops (Scenario 3)', async (): Promise<void> => {
    // Set a low maxLoops to speed up the test
    await fixture.writeConfig({
      project_name: 'LoopTest',
      maxLoops: 3,
    });
    const orchestrator = await fixture.initOrchestrator();

    // Mock Architect to always return failing signal via error
    fixture.registerMockDriver('gemini', async (skill): Promise<Result<string, Error>> => {
      if (skill.name === 'architect') {
        return Promise.resolve(Result.fail(new Error('Infinite loop trigger')));
      }
      return Promise.resolve(Result.ok('OK'));
    });

    await orchestrator.start('Loop me');

    expect(orchestrator.session.state.loop_count).toBeGreaterThan(0);
    expect(orchestrator.session.state.status).toBe('FAILED');
  });

  test('should retreat to PLANNING from EXECUTING when SignalDetectedError:REPLAN occurs (Scenario 8)', async (): Promise<void> => {
    await fixture.writeConfig({ project_name: 'RetreatTest' });
    await fixture.writeSkill('developer', { name: 'developer', provider: 'gemini' });
    const orchestrator = await fixture.initOrchestrator();

    let replaned = false;

    fixture.registerMockDriver('gemini', async (skill): Promise<Result<string, Error>> => {
      if (skill.name === 'architect') {
        return Promise.resolve(Result.ok(ProjectFixture.createArchitectResult()));
      }
      if (skill.name === 'planner') {
        const taskId = replaned ? 't2' : 't1';
        return Promise.resolve(
          Result.ok(
            ProjectFixture.createPlanResult([
              { id: taskId, skill: 'developer', message: 'Execute', description: 'desc' },
            ]),
          ),
        );
      }
      if (skill.name === 'developer' && !replaned) {
        replaned = true;
        throw new SignalDetectedError(Signal.replan('Need better plan'));
      }
      return Promise.resolve(Result.ok('OK'));
    });

    await orchestrator.start('Retreat Test', false);

    const stateEnters: string[] = fixture.mockHost.emit.mock.calls
      .filter((call: [string, unknown]) => call[0] === 'state:enter')
      .map((call: [string, unknown]) => (call[1] as { state: string }).state);

    // Sequence: ARCHITECTING -> PLANNING -> EXECUTING -> PLANNING -> EXECUTING -> COMPLETED
    // We expect it to reach COMPLETED status eventually
    expect(orchestrator.session.state.status).toBe('COMPLETED');
    expect(stateEnters.length).toBeGreaterThan(4);
  });

  test('should interrupt execution when an external signal is detected (Scenario 14)', async (): Promise<void> => {
    await fixture.writeConfig({ project_name: 'InterruptTest' });
    await fixture.writeSkill('developer', { name: 'developer', provider: 'gemini' });
    const orchestrator = await fixture.initOrchestrator();

    fixture.registerMockDriver('gemini', async (skill: ISkill): Promise<Result<string, Error>> => {
      if (skill.name === 'architect') return Promise.resolve(Result.ok(ProjectFixture.createArchitectResult()));
      if (skill.name === 'planner')
        return Promise.resolve(
          Result.ok(
            ProjectFixture.createPlanResult([{ id: 't1', skill: 'developer', message: 'msg', description: 'desc' }]),
          ),
        );
      if (skill.name === 'developer') {
        const signalPath = path.join(fixture.tmpDir, '.ai/signals/interrupt.signal.yaml');
        await fs.ensureDir(path.dirname(signalPath));
        await fs.writeFile(signalPath, 'type: REPLAN\nreason: User changed mind');
        return Promise.resolve(Result.ok('OK'));
      }
      return Promise.resolve(Result.ok('OK'));
    });

    await orchestrator.start('Run flow');

    const stateEnters: string[] = fixture.mockHost.emit.mock.calls
      .filter((call: [string, unknown]) => call[0] === 'state:enter')
      .map((call: [string, unknown]) => (call[1] as { state: string }).state);

    expect(stateEnters).toContain('PLANNING');
    expect(orchestrator.session.state.status).toBe('COMPLETED');
  });
});
