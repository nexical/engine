/**
 * @file DriverManagement.test.ts
 *
 * SCOPE:
 * This test verifies the driver selection and fallback mechanisms within the DriverRegistry.
 * It specifically checks if the system falls back to the default driver (e.g. gemini)
 * when a configured driver is not found.
 *
 * COVERAGE:
 * - DriverRegistry.get() and logic in Agents resolving drivers.
 * - Configuration parsing for driver selection.
 * - Fallback behavior for resilience.
 */

import { Result } from '../../src/domain/Result.js';
import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Driver Management Integration', () => {
  let fixture: ProjectFixture;

  beforeEach(async (): Promise<void> => {
    fixture = new ProjectFixture();
    await fixture.setup();
  });

  afterEach(async (): Promise<void> => {
    await fixture.cleanup();
  });

  test('should fallback to default driver when requested driver is missing (Scenario 4)', async (): Promise<void> => {
    // Custom config to request non-existent driver
    await fixture.writeConfig({
      project_name: 'DriverTest',
      agents: {
        architect: { driver: 'non-existent-driver' },
      },
    }); // ProjectFixture.writeConfig takes a Partial<config>, so we can pass nested objects.

    await fixture.initOrchestrator();

    let defaultDriverCalled = false;
    fixture.registerMockDriver('gemini', async (skill): Promise<Result<string, Error>> => {
      defaultDriverCalled = true;
      if (skill.name === 'architect') return Promise.resolve(Result.ok(ProjectFixture.createArchitectResult()));
      if (skill.name === 'planner') return Promise.resolve(Result.ok(ProjectFixture.createPlanResult([])));
      return Promise.resolve(Result.ok('OK'));
    });

    const orchestrator = fixture.orchestrator;

    await orchestrator.start('Driver test');

    // Verify gemini was used even though 'non-existent-driver' was requested in config
    expect(defaultDriverCalled).toBe(true);
    expect(orchestrator.session.state.status).toBe('COMPLETED');
  });
});
