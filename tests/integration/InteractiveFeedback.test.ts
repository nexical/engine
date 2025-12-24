/**
 * @file InteractiveFeedback.test.ts
 *
 * SCOPE:
 * This test verifies the interactive mode of the Orchestrator, specifically how it handles
 * user feedback during state transitions. It tests the feedback loop where a user
 * rejects an initial proposal (Architecture) and requests changes, causing a `REARCHITECT` loop.
 *
 * COVERAGE:
 * - Interactive mode (start(prompt, true)).
 * - IRuntimeHost.ask() integration.
 * - State transition logic for feedback (NEXT vs REARCHITECT).
 */

import { jest } from '@jest/globals';

import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Interactive Feedback Integration', () => {
  let fixture: ProjectFixture;

  beforeEach(async () => {
    fixture = new ProjectFixture();
    await fixture.setup();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  test('should incorporate user feedback during ARCHITECTING', async () => {
    await fixture.writeConfig({ project_name: 'FeedbackTest' });
    await fixture.writeSkill('developer', { name: 'developer', provider: 'gemini' });

    // Override ask mock to simulate specific user interaction
    // Sequence: Feedback -> Approve -> Approve -> Approve
    fixture.mockHost.ask = jest
      .fn<any>()
      .mockResolvedValueOnce('Please use React instead of Vue') // Feedback on Architecture
      .mockResolvedValueOnce('yes') // Approve updated Architecture
      .mockResolvedValueOnce('yes') // Approve Plan
      .mockResolvedValueOnce('yes'); // Approve execution? (if applicable)

    const orchestrator = await fixture.initOrchestrator();

    let archCallCount = 0;
    fixture.registerMockDriver('gemini', async (skill: any) => {
      if (skill.name === 'architect') {
        archCallCount++;
        return {
          isFail: () => false,
          unwrap: () => ProjectFixture.createArchitectResult(['Component ' + archCallCount]),
          error: () => null,
        };
      }
      if (skill.name === 'planner') {
        return {
          isFail: () => false,
          unwrap: () =>
            ProjectFixture.createPlanResult([
              { id: 'task1', skill: 'developer', message: 'test', description: 'test' },
            ]),
          error: () => null,
        };
      }
      return { isFail: () => false, unwrap: () => 'OK', error: () => null };
    });

    // Run in interactive mode
    await orchestrator.start('Build a web app', true);

    const skillCalls = (fixture.orchestrator.brain as any).driverRegistry
      .get('gemini')
      .execute.mock.calls.map((c: any) => c[0].name);

    // Check call sequence: Architect -> Architect (retry) -> Planner -> Developer
    // Actually, ProjectFixture mock driver logic:
    // Architect called 1st time. User says 'Feedback'.
    // State loop: REARCHITECT.
    // Architect called 2nd time. User says 'yes'.
    // State loop: NEXT.
    // Planner called. User says 'yes'.
    // Developer called.

    // Filter out irrelevant calls if any, but driver execute is clean.
    expect(skillCalls[0]).toBe('architect');
    expect(skillCalls[1]).toBe('architect');
    expect(skillCalls[2]).toBe('planner');

    // Assert state transitions
    const stateEnters = fixture.mockHost.emit.mock.calls
      .filter((call: any) => call[0] === 'state:enter')
      .map((call: any) => call[1].state);

    expect(stateEnters).toEqual(['ARCHITECTING', 'ARCHITECTING', 'PLANNING', 'EXECUTING', 'COMPLETED']);
  });
});
