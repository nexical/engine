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

import { jest } from '@jest/globals';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import path from 'path';

import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Session Resumption Integration', () => {
  let fixture: ProjectFixture;

  beforeEach(async () => {
    fixture = new ProjectFixture();
    await fixture.setup();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  test('should resume session from saved state', async () => {
    await fixture.writeConfig({ project_name: 'ResumeTest' });

    // 1. Start first session and let it run until it saves state
    const orchestrator1 = await fixture.initOrchestrator();

    // Setup Mock Driver to stop after first state
    fixture.registerMockDriver('gemini', async (skill: any) => {
      if (skill.name === 'architect')
        return { isFail: () => false, unwrap: () => ProjectFixture.createArchitectResult(), error: () => null };
      if (skill.name === 'planner') {
        // Force state save before crashing so we can resume at PLANNING
        // Note: In real flow, state is saved on entering STATE.
        // We want to verify we can resume FROM planning.
        // So if we crash IN planning, we should resume IN planning.
        // Or if we crash before completing, we resume at start of that state?

        // Let's explicitly save for test control
        await orchestrator1.workspace.saveState(orchestrator1.session.state);
        throw new Error('Stop here');
      }
      return { isFail: () => false, unwrap: () => 'OK', error: () => null };
    });

    // Run until failure/stop
    try {
      await orchestrator1.start('Initial Prompt');
    } catch (e) {
      // Expected
    }

    const sessionId = orchestrator1.session.id;
    const stateFile = path.join(fixture.tmpDir, '.ai/state.yml');
    expect(fs.existsSync(stateFile)).toBe(true);

    const savedState = yaml.load(fs.readFileSync(stateFile, 'utf8')) as any;
    expect(savedState.session_id).toBe(sessionId);

    // 2. Clear first orchestrator and start a second one pointing to same dir
    // Reset mockHost emit to clean state
    fixture.mockHost.emit.mockClear();

    // Re-init orchestrator (creates new instance on same fixture)
    const orchestrator2 = await fixture.initOrchestrator();

    // Setup Mock Driver for resumption (this time it succeeds)
    // Note: registerMockDriver modifies the global registry of the NEW orchestrator's brain
    fixture.registerMockDriver('gemini', async (skill: any) => {
      if (skill.name === 'planner')
        return { isFail: () => false, unwrap: () => ProjectFixture.createPlanResult([]), error: () => null };
      return { isFail: () => false, unwrap: () => 'OK', error: () => null };
    });

    // Mock workspace to return required data for PLANNING (since Architect didn't run this session)
    // The Architect artifacts persist on disk, so real Workspace WOULD find them.
    // But getArchitecture might be cached or require loading.
    // Since fixture uses real FS, saveArchitect logic in Run 1 should have written files.
    // So Run 2 should read them.
    // BUT, to be safe and fast, let's mock if needed?
    // No, let's trust the FS integration feature of ProjectFixture.
    // Run 1 saved architecture. Run 2 reads it.

    // Wait, Run 1 'architect' mock returned createArchitectResult().
    // Does ArchitectAgent save it? Yes.
    // So FS should have it.

    // Call resume
    await orchestrator2.session.resume();

    expect(orchestrator2.session.id).toBe(sessionId);
    expect(orchestrator2.session.state.status).toBe('COMPLETED');

    // Verify it entered PLANNING directly (skipped ARCHITECTING)
    const stateEnters = fixture.mockHost.emit.mock.calls
      .filter((call: any) => call[0] === 'state:enter')
      .map((call: any) => call[1].state);

    expect(stateEnters).toContain('PLANNING');
    expect(stateEnters).not.toContain('ARCHITECTING');
  });
});
