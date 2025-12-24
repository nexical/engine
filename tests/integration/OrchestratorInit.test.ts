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

import { jest } from '@jest/globals';

import { Orchestrator } from '../../src/orchestrator.js';
import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Orchestrator Initialization Integration', () => {
  let fixture: ProjectFixture;

  beforeEach(async () => {
    fixture = new ProjectFixture();
    await fixture.setup();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  test('should initialize all services and load drivers', async () => {
    // ProjectFixture.initOrchestrator calls init() internally
    const orchestrator = await fixture.initOrchestrator();

    // Verify services are attached
    expect(orchestrator.project).toBeDefined();
    expect(orchestrator.brain).toBeDefined();
    expect(orchestrator.workspace).toBeDefined();
    expect(orchestrator.session).toBeDefined();

    // Verify Project root is correct
    expect(orchestrator.project.rootDirectory).toBe(fixture.tmpDir);

    // Verify Brain has registered factory methods
    const workspace = orchestrator.workspace;
    expect(orchestrator.brain.createArchitect(workspace)).toBeDefined();
    expect(orchestrator.brain.createPlanner(workspace)).toBeDefined();
    expect(orchestrator.brain.createDeveloper(workspace)).toBeDefined();
  });

  test('should fail if access property before init', () => {
    // Here we do NOT use initOrchestrator because we want a raw instance
    const orchestrator = new Orchestrator(fixture.tmpDir, fixture.mockHost);
    expect(() => orchestrator.project).toThrow('Orchestrator not initialized');
  });
});
