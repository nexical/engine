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

import { Result } from '../../src/domain/Result.js';
import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Interactive Feedback Integration', () => {
  let fixture: ProjectFixture;

  beforeEach(async (): Promise<void> => {
    fixture = new ProjectFixture();
    await fixture.setup();
  });

  afterEach(async (): Promise<void> => {
    await fixture.cleanup();
  });

  test('should cycle through feedback and update state (Scenario 2 & 12)', async (): Promise<void> => {
    await fixture.writeConfig({ project_name: 'FeedbackTest' });
    const orchestrator = await fixture.initOrchestrator();

    let architectCalls = 0;
    fixture.registerMockDriver('gemini', async (skill): Promise<Result<string, Error>> => {
      if (skill.name === 'architect') {
        architectCalls++;
        return Promise.resolve(Result.ok(ProjectFixture.createArchitectResult([`Iter ${architectCalls}`])));
      }
      if (skill.name === 'planner') return Promise.resolve(Result.ok(ProjectFixture.createPlanResult([])));
      return Promise.resolve(Result.ok('OK'));
    });

    // Mock interactive response: No -> Yes
    fixture.mockHost.ask
      .mockResolvedValueOnce('no') // "Are you happy with the architecture?"
      .mockResolvedValueOnce('yes'); // "Are you happy with the SECOND architecture?"

    await orchestrator.start('Build it', true);

    expect(orchestrator.session.state.status).toBe('COMPLETED');
    expect(architectCalls).toBe(2);

    // Verify state transitions
    const stateEnters: string[] = fixture.mockHost.emit.mock.calls
      .filter((call: [string, unknown]) => call[0] === 'state:enter')
      .map((call: [string, unknown]) => (call[1] as { state: string }).state);
    expect(stateEnters).toContain('ARCHITECTING');
  });
});
