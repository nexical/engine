/**
 * @file OrchestratorInit.test.ts
 *
 * SCOPE:
 * This test verifies the initialization lifecycle of the Orchestrator.
 * It checks that all core services (Brain, Workspace, Session) are correctly attached
 * and available after initialization, and asserts that accessing them before init throws errors.
 *
 * COVERAGE:
 * - Orchestrator.init() method.
 * - Service instantiation (Brain, Workspace).
 * - Pre-init access guards.
 */

import { ISkill } from '../../src/domain/Driver.js';
import { Result } from '../../src/domain/Result.js';
import { Orchestrator } from '../../src/orchestrator.js';
import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Orchestrator Initialization Integration', () => {
  let fixture: ProjectFixture;

  beforeEach(async (): Promise<void> => {
    fixture = new ProjectFixture();
    await fixture.setup();
  });

  afterEach(async (): Promise<void> => {
    await fixture.cleanup();
  });

  test('should initialize all services correctly (Scenario 5)', async (): Promise<void> => {
    // ProjectFixture.initOrchestrator calls init() internally
    const orchestrator = await fixture.initOrchestrator();

    // Verify services are attached
    expect(orchestrator.project).toBeDefined();
    expect(orchestrator.brain).toBeDefined();
    expect(orchestrator.workspace).toBeDefined();
    expect(orchestrator.session).toBeDefined();

    // Verify Project root is correct
    expect(orchestrator.project.paths.drivers).toBeDefined();

    // Verify Brain has registered factory methods
    const workspace = orchestrator.workspace;
    expect(orchestrator.brain.createArchitect(workspace)).toBeDefined();
    expect(orchestrator.brain.createPlanner(workspace)).toBeDefined();
    expect(orchestrator.brain.createExecutor(workspace)).toBeDefined();
  });

  test('should register drivers during initialization', async (): Promise<void> => {
    await fixture.writeConfig({ project_name: 'DriverRegTest' });
    const orchestrator = await fixture.initOrchestrator();

    // Register a mock driver
    let driverExecuted = false;
    fixture.registerMockDriver('gemini', async (): Promise<Result<string, Error>> => {
      driverExecuted = true; // Keep this to verify execution
      return Promise.resolve(Result.ok('OK'));
    });

    const result = orchestrator.brain.getDriver('gemini'); // Changed to 'gemini'
    expect(result).toBeDefined();
    if (result) {
      await result.execute({ name: 'test', description: 'test', provider: 'gemini' } as unknown as ISkill); // Changed to 'gemini'
      expect(driverExecuted).toBe(true);
    }
  });

  test('should fail to access services before init (Scenario 6)', (): void => {
    const orchestrator = new Orchestrator(fixture.tmpDir, fixture.mockHost);

    expect(() => orchestrator.project).toThrow('not initialized');
    expect(() => orchestrator.brain).toThrow('not initialized');
  });
});
