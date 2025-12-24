/**
 * @file WorkflowEngine.test.ts
 *
 * SCOPE:
 * This test verifies the core Workflow state machine logic.
 * It checks the standard happy-path transition (ARCHITECTING -> PLANNING -> EXECUTING -> COMPLETED)
 * and verifies that critical errors in any state cause the workflow to transition to FAILED.
 *
 * COVERAGE:
 * - Workflow state transitions.
 * - Orchestrator.execute() entry point.
 * - Error handling propagation to FAILED state.
 */

import { jest } from '@jest/globals';

import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Workflow Engine Integration', () => {
  let fixture: ProjectFixture;

  beforeEach(async () => {
    fixture = new ProjectFixture();
    await fixture.setup();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  test('should transition through ARCHITECTING -> PLANNING -> EXECUTING -> COMPLETED', async () => {
    const orchestrator = await fixture.initOrchestrator();

    // Mock Agents in Brain directly to bypass actual logic and just signal success
    // We want to test the WORKFLOW engine, not the agents.
    const mockArchitect = { design: jest.fn().mockImplementation(() => Promise.resolve({ id: 'arch-1' })) };
    const mockPlanner = { plan: jest.fn().mockImplementation(() => Promise.resolve({ id: 'plan-1' })) };
    // Developer execute normally returns (void) or logic?
    // DeveloperAgent.execute returns Promise<void>.
    const mockDeveloper = { execute: jest.fn().mockImplementation(() => Promise.resolve()) };

    const brain = orchestrator.brain;
    jest.spyOn(brain, 'createArchitect').mockReturnValue(mockArchitect as any);
    jest.spyOn(brain, 'createPlanner').mockReturnValue(mockPlanner as any);
    jest.spyOn(brain, 'createDeveloper').mockReturnValue(mockDeveloper as any);

    // Mock workspace.getArchitecture to return something so PlanningState doesn't fail
    jest.spyOn(orchestrator.workspace, 'getArchitecture').mockResolvedValue({} as any);

    // Run the orchestrator
    await orchestrator.execute('Build something');

    // Verify each agent was called once
    expect(mockArchitect.design).toHaveBeenCalledWith('Build something');
    expect(mockPlanner.plan).toHaveBeenCalled();
    expect(mockDeveloper.execute).toHaveBeenCalled();

    // Verify the sequence of states via host emits
    const stateEnters = fixture.mockHost.emit.mock.calls
      .filter((call: any) => call[0] === 'state:enter')
      .map((call: any) => call[1].state);

    expect(stateEnters).toEqual(['ARCHITECTING', 'PLANNING', 'EXECUTING', 'COMPLETED']);
  });

  test('should stop on workflow failure', async () => {
    const orchestrator = await fixture.initOrchestrator();

    // Mock Architect to fail
    const mockArchitect = {
      design: jest.fn().mockImplementation(() => Promise.reject(new Error('Architectural meltdown'))),
    };
    jest.spyOn(orchestrator.brain, 'createArchitect').mockReturnValue(mockArchitect as any);

    await orchestrator.execute('Build something');

    const stateEnters = fixture.mockHost.emit.mock.calls
      .filter((call: any) => call[0] === 'state:enter')
      .map((call: any) => call[1].state);

    // Should enter ARCHITECTING then stop (FAILED)
    expect(stateEnters).toEqual(['ARCHITECTING']);
    expect(orchestrator.session.state.status).toBe('FAILED');
  });
});
