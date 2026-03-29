/**
 * @file SessionResumption.test.ts
 *
 * SCOPE:
 * This test verifies the session persistence and resumption capabilities.
 * It simulates a system crash (or forced stop) during the workflow, ensures the state
 * is saved to disk, and then verifies that a new Orchestrator instance can resume
 * from that saved state.
 *
 * COVERAGE:
 * - Session.saveState / resume logic.
 * - Artifact persistence (state.yml).
 * - Workflow state transitions upon resume.
 */

import fs from 'fs-extra';
import yaml from 'js-yaml';
import path from 'path';

import { IDriverContext } from '../../src/domain/Driver.js';
import { Result } from '../../src/domain/Result.js';
import { DriverConfig } from '../../src/domain/SkillConfig.js';
import { EngineState } from '../../src/domain/State.js';
import { Orchestrator } from '../../src/orchestrator.js';
import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Session Resumption Integration', () => {
  let fixture: ProjectFixture;

  beforeEach(async (): Promise<void> => {
    fixture = new ProjectFixture();
    await fixture.setup();
  });

  afterEach(async (): Promise<void> => {
    await fixture.cleanup();
  });

  test('should resume session from saved state (Scenario 1)', async (): Promise<void> => {
    await fixture.writeConfig({ project_name: 'ResumptionTest' });
    const orchestrator = await fixture.initOrchestrator();

    fixture.registerMockDriver(
      'gemini',
      async (config: DriverConfig, options?: IDriverContext): Promise<Result<string, Error>> => {
        // @ts-expect-error: Accessing internal properties for testing
        if ((options?.params as Record<string, unknown>)?.user_request)
          return Promise.resolve(Result.ok(ProjectFixture.createArchitectResult()));
        // @ts-expect-error: Accessing internal properties for testing
        if ((options?.params as Record<string, unknown>)?.user_prompt)
          return Promise.resolve(Result.ok(ProjectFixture.createPlanResult([])));
        return Promise.resolve(Result.ok('OK'));
      },
    );

    await orchestrator.start('First run');
    const sessionId = orchestrator.session.id;

    // Create a new orchestrator instance to simulate restart
    const newOrchestrator = await fixture.initOrchestrator();
    await newOrchestrator.session.resume();

    expect(newOrchestrator.session.id).toBe(sessionId);
    expect(newOrchestrator.session.state.status).toBe('COMPLETED');
  });

  test('should maintain state continuity across resumption (Scenario 7)', async (): Promise<void> => {
    await fixture.writeConfig({ project_name: 'ContinuityTest' });
    const orchestrator = await fixture.initOrchestrator();

    // Mock a partial run: Architecting -> Planning -> STOP
    fixture.registerMockDriver(
      'gemini',
      (config: DriverConfig, options?: IDriverContext): Promise<Result<string, Error>> => {
        // @ts-expect-error: Accessing internal properties for testing
        if ((options?.params as Record<string, unknown>)?.user_request)
          return Promise.resolve(Result.ok(ProjectFixture.createArchitectResult()));
        // @ts-expect-error: Accessing internal properties for testing
        if ((options?.params as Record<string, unknown>)?.user_prompt)
          return Promise.resolve(Result.ok(ProjectFixture.createPlanResult([])));
        return Promise.resolve(Result.ok('OK'));
      },
    );

    // Manual state manipulation for continuity test
    const state: EngineState = orchestrator.session.state;
    state.status = 'PLANNING';
    state.context.preserved_value = 'continuity-verified';
    await orchestrator.workspace.saveState(state);

    const resumedOrchestrator = await fixture.initOrchestrator();
    await resumedOrchestrator.session.resume();

    expect(resumedOrchestrator.session.state.context.preserved_value).toBe('continuity-verified');
  });

  test('should resume session from saved state after crash during planning', async (): Promise<void> => {
    await fixture.writeConfig({ project_name: 'ResumeTest' });

    // 1. Start first session and let it run until it saves state
    const orchestrator1: Orchestrator = await fixture.initOrchestrator();

    // Setup Mock Driver to stop after first state
    fixture.registerMockDriver(
      'gemini',
      async (config: DriverConfig, options?: IDriverContext): Promise<Result<string, Error>> => {
        // @ts-expect-error: Accessing internal properties for testing
        if ((options?.params as Record<string, unknown>)?.user_request)
          return Promise.resolve(Result.ok(ProjectFixture.createArchitectResult()));
        // @ts-expect-error: Accessing internal properties for testing
        if ((options?.params as Record<string, unknown>)?.user_prompt) {
          // Force state save before crashing
          await orchestrator1.workspace.saveState(orchestrator1.session.state);
          return Promise.resolve(Result.fail(new Error('Stop here'))); // Simulate crash
        }
        return Promise.resolve(Result.ok('OK'));
      },
    );

    // Run until failure/stop
    try {
      await orchestrator1.start('Initial Prompt');
    } catch (e) {
      // Expected
      expect((e as Error).message).toBe('Stop here');
    }

    const sessionId: string = orchestrator1.session.id;
    const stateFile: string = path.join(fixture.tmpDir, '.ai/state.yml');
    expect(fs.existsSync(stateFile)).toBe(true);

    const savedState: EngineState = yaml.load(fs.readFileSync(stateFile, 'utf8')) as EngineState;
    expect(savedState.session_id).toBe(sessionId);
    expect(savedState.status).toBe('FAILED');

    // 2. Restart and resume
    fixture.mockHost.emit.mockClear();
    const orchestrator2: Orchestrator = await fixture.initOrchestrator();

    fixture.registerMockDriver(
      'gemini',
      (config: DriverConfig, options?: IDriverContext): Promise<Result<string, Error>> => {
        // @ts-expect-error: Accessing internal properties for testing
        if ((options?.params as Record<string, unknown>)?.user_prompt)
          return Promise.resolve(Result.ok(ProjectFixture.createPlanResult([])));
        return Promise.resolve(Result.ok('OK'));
      },
    );

    await orchestrator2.session.resume();

    expect(orchestrator2.session.id).toBe(sessionId);
    expect(orchestrator2.session.state.status).toBe('COMPLETED');

    const stateEnters: string[] = fixture.mockHost.emit.mock.calls
      .filter((call: [string, unknown]) => call[0] === 'state:enter')
      .map((call: [string, unknown]) => (call[1] as { state: string }).state);

    expect(stateEnters).toContain('PLANNING');
    expect(stateEnters).not.toContain('ARCHITECTING');
  });
});
