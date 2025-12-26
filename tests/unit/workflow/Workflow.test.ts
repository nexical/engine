import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { Brain } from '../../../src/agents/Brain.js';
import { IProject } from '../../../src/domain/Project.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { EngineState } from '../../../src/domain/State.js';
import { IWorkspace } from '../../../src/domain/Workspace.js';
import { Signal } from '../../../src/workflow/Signal.js';
import { State } from '../../../src/workflow/states/State.js';

// Mocks
const MockArchitectingState = jest.fn().mockImplementation(() => ({ name: 'ARCHITECTING' }));
const MockPlanningState = jest.fn().mockImplementation(() => ({ name: 'PLANNING' }));
const MockExecutingState = jest.fn().mockImplementation(() => ({ name: 'EXECUTING' }));
const MockCompletedState = jest.fn().mockImplementation(() => ({ name: 'COMPLETED' }));

const mockGraph = {
  getInitialState: jest.fn().mockReturnValue('ARCHITECTING'),
  getNextState: jest.fn(),
  getErrorTarget: jest.fn(),
  getConfig: jest.fn().mockReturnValue({ maxLoops: 5 }),
};
const MockWorkflowGraph = jest.fn().mockReturnValue(mockGraph);

const mockBrain = { getEvolution: jest.fn() };
const mockEvolution = { recordEvent: jest.fn() };
mockBrain.getEvolution.mockReturnValue(mockEvolution);

const mockWorkspace = { saveState: jest.fn() };
const mockHost = { log: jest.fn(), emit: jest.fn() };
const mockProject = {};

// Register Mocks
jest.unstable_mockModule('../../../src/workflow/states/State.js', () => ({ State: class {} }));
jest.unstable_mockModule('../../../src/workflow/states/ArchitectingState.js', () => ({
  ArchitectingState: MockArchitectingState,
}));
jest.unstable_mockModule('../../../src/workflow/states/PlanningState.js', () => ({ PlanningState: MockPlanningState }));
jest.unstable_mockModule('../../../src/workflow/states/ExecutingState.js', () => ({
  ExecutingState: MockExecutingState,
}));
jest.unstable_mockModule('../../../src/workflow/states/CompletedState.js', () => ({
  CompletedState: MockCompletedState,
}));
jest.unstable_mockModule('../../../src/workflow/WorkflowGraph.js', () => ({
  WorkflowGraph: MockWorkflowGraph,
  DefaultWorkflowConfig: {},
}));

// Define the shape of the Workflow class constructor
type WorkflowConstructor = new (
  brain: Brain,
  project: IProject,
  workspace: IWorkspace,
  host: IRuntimeHost,
) => {
  start(state: EngineState, onStateChange?: () => Promise<void>): Promise<void>;
  registerState(state: State): void;
  currentState?: State;
  // Access private property for testing if needed, though strictly not allowed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  states: Map<string, any>;
};

let Workflow: WorkflowConstructor;
try {
  const mod = await import('../../../src/workflow/Workflow.js');
  Workflow = mod.Workflow as unknown as WorkflowConstructor;
} catch (e) {
  // eslint-disable-next-line no-console
  console.error('Error importing Workflow module:', e);
}

describe('Workflow Unit Tests', () => {
  let workflow: InstanceType<typeof Workflow>;
  let engineState: EngineState;

  type StateRun = (state: EngineState) => Promise<Signal>;

  // Helper to setup mock states in the workflow map
  const setupMockState = (name: string, runImpl: jest.Mock<StateRun>): { name: string; run: jest.Mock<StateRun> } => {
    const state = { name, run: runImpl } as unknown as State;
    workflow.registerState(state);
    return { name, run: runImpl };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGraph.getInitialState.mockReturnValue('ARCHITECTING');
    mockGraph.getConfig.mockReturnValue({ maxLoops: 5 });

    engineState = new EngineState('test-session');
    engineState.status = 'IDLE';

    workflow = new Workflow(
      mockBrain as unknown as Brain,
      mockProject as unknown as IProject,
      mockWorkspace as unknown as IWorkspace,
      mockHost as unknown as IRuntimeHost,
    );

    // Mock default states behavior to avoid real logic
    setupMockState('ARCHITECTING', jest.fn<StateRun>().mockResolvedValue(Signal.NEXT) as jest.Mock<StateRun>);
    setupMockState('PLANNING', jest.fn<StateRun>().mockResolvedValue(Signal.NEXT) as jest.Mock<StateRun>);
    setupMockState('EXECUTING', jest.fn<StateRun>().mockResolvedValue(Signal.NEXT) as jest.Mock<StateRun>);
    setupMockState('COMPLETED', jest.fn<StateRun>().mockResolvedValue(Signal.COMPLETE) as jest.Mock<StateRun>);
  });

  it('should resume from existing state', async () => {
    engineState.status = 'EXECUTING';
    engineState.current_state = 'EXECUTING';

    // Setup EXECUTING to finish immediately
    const execRun = jest.fn<StateRun>().mockResolvedValue(Signal.COMPLETE);
    setupMockState('EXECUTING', execRun);

    // Setup COMPLETED to finish flow
    setupMockState('COMPLETED', jest.fn<StateRun>().mockResolvedValue(Signal.COMPLETE));

    await workflow.start(engineState);

    expect(mockHost.log).toHaveBeenCalledWith(
      expect.stringContaining('info'),
      expect.stringContaining('Resuming from state: EXECUTING'),
    );
    expect(execRun).toHaveBeenCalled();
  });

  it('should fail if max loops exceeded', async () => {
    engineState.loop_count = 6; // Max is 5

    await workflow.start(engineState);

    expect(mockHost.log).toHaveBeenCalledWith(
      expect.stringContaining('error'),
      expect.stringContaining('Maximum retry limit reached'),
    );
    expect(engineState.status).toBe('FAILED');
  });

  it('should handle state error validation recovery', async () => {
    // ARCHITECTING throws error
    const archRun = jest.fn<StateRun>().mockRejectedValue(new Error('Test Error'));
    setupMockState('ARCHITECTING', archRun);

    // Recovers to PLANNING
    mockGraph.getErrorTarget.mockReturnValue('PLANNING');
    const planRun = jest.fn<StateRun>().mockResolvedValue(Signal.COMPLETE); // Exit loop after recovery
    setupMockState('PLANNING', planRun);

    // COMPLETED needed to exit
    setupMockState('COMPLETED', jest.fn<StateRun>().mockResolvedValue(Signal.COMPLETE));

    await workflow.start(engineState);

    expect(mockHost.log).toHaveBeenCalledWith(
      expect.stringContaining('warn'),
      expect.stringContaining('Recovering to PLANNING'),
    );
    expect(archRun).toHaveBeenCalled();
    expect(planRun).toHaveBeenCalled();
  });

  it('should fail if error recovery target missing', async () => {
    setupMockState('ARCHITECTING', jest.fn<StateRun>().mockRejectedValue(new Error('Fatal Error')));
    mockGraph.getErrorTarget.mockReturnValue(undefined); // No recovery

    await workflow.start(engineState);

    expect(mockHost.log).toHaveBeenCalledWith(
      expect.stringContaining('error'),
      expect.stringContaining('Workflow Failed: Unhandled error in ARCHITECTING'),
    );
    expect(engineState.status).toBe('FAILED');
    expect(mockEvolution.recordEvent).toHaveBeenCalled();
  });

  it('should handle explicit FAIL signal', async () => {
    setupMockState('ARCHITECTING', jest.fn<StateRun>().mockResolvedValue(Signal.fail('Explicit Fail')));

    await workflow.start(engineState);

    expect(mockHost.log).toHaveBeenCalledWith(
      expect.stringContaining('error'),
      expect.stringContaining('Workflow Failed: Explicit Fail'),
    );
    expect(engineState.status).toBe('FAILED');
    expect(mockEvolution.recordEvent).toHaveBeenCalled();
  });

  it('should complete successfully when COMPLETED state signals COMPLETE', async () => {
    engineState.current_state = 'COMPLETED'; // Shortcut directly to end
    engineState.status = 'COMPLETED';

    setupMockState('COMPLETED', jest.fn<StateRun>().mockResolvedValue(Signal.COMPLETE));

    await workflow.start(engineState);

    expect(mockHost.log).toHaveBeenCalledWith(
      expect.stringContaining('info'),
      expect.stringContaining('Workflow Finished Successfully'),
    );
    expect(mockHost.emit).toHaveBeenCalledWith('workflow:complete', {});
  });

  it('should implicitly transition to COMPLETED on COMPLETE signal', async () => {
    setupMockState('ARCHITECTING', jest.fn<StateRun>().mockResolvedValue(Signal.COMPLETE));
    mockGraph.getNextState.mockReturnValue(undefined); // No explicit next state for COMPLETE

    const completeRun = jest.fn<StateRun>().mockResolvedValue(Signal.COMPLETE);
    setupMockState('COMPLETED', completeRun);

    await workflow.start(engineState);

    expect(completeRun).toHaveBeenCalled();
  });

  it('should fail if no next state found', async () => {
    // ARCHITECTING returns NEXT, but graph returns nothing
    setupMockState('ARCHITECTING', jest.fn<StateRun>().mockResolvedValue(Signal.NEXT));
    mockGraph.getNextState.mockReturnValue(undefined);

    await workflow.start(engineState);

    expect(mockHost.log).toHaveBeenCalledWith(
      expect.stringContaining('error'),
      expect.stringContaining('No valid next state found'),
    );
    expect(engineState.status).toBe('FAILED');
  });

  it('should handle loop limit reached', async () => {
    mockGraph.getConfig.mockReturnValue({ maxLoops: 1 });
    engineState.loop_count = 2; // Exceeds limit

    await workflow.start(engineState);

    expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Maximum retry limit reached'));
    expect(engineState.status).toBe('FAILED');
  });

  it('should break loop if no current state (invalid initialization)', async () => {
    // Force initial state to be invalid to trigger if (!this.currentState) check
    mockGraph.getInitialState.mockReturnValue('INVALID_START');
    // Workflow constructor sets state. We need to re-create workflow or hack it.
    workflow.currentState = undefined;

    await workflow.start(engineState);
    expect(mockHost.log).toHaveBeenCalledWith('error', '[Workflow] No current state! Breaking loop.');
  });

  it('should log error if next state returned by graph is not registered', async () => {
    mockGraph.getNextState.mockReturnValue('UNREGISTERED_STATE');
    // First run succeeds
    setupMockState('ARCHITECTING', jest.fn<StateRun>().mockResolvedValue(Signal.COMPLETE));

    await workflow.start(engineState);

    // Should fall through to "No valid next state found"
    expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('No valid next state found'));
  });

  it('should transition to valid next state', async () => {
    // Architecting -> Planning
    mockGraph.getNextState.mockReturnValue('PLANNING');

    // Architecting runs once
    setupMockState('ARCHITECTING', jest.fn<StateRun>().mockResolvedValue(Signal.NEXT));

    // Planning runs once and completes
    const planningRun = jest.fn<StateRun>().mockResolvedValue(Signal.COMPLETE);
    setupMockState('PLANNING', planningRun);

    // Mock graph to return undefined for subsequent states to finish loop if needed
    mockGraph.getNextState.mockImplementation((state, _signal) => {
      if (state === 'ARCHITECTING') return 'PLANNING';
      return undefined;
    });

    await workflow.start(engineState);

    // We expect transition to PLANNING
    expect(planningRun).toHaveBeenCalled();
    // Since mock runs transition to COMPLETE automatically in loop, final state is COMPLETED
    expect(engineState.current_state).toBe('COMPLETED');
  });

  it('should fallback to initial state if resume state invalid', async () => {
    engineState.status = 'EXECUTING';
    engineState.current_state = 'INVALID_STATE';
    // No mock state for INVALID_STATE

    await workflow.start(engineState);

    // Should fall back to initial state (ARCHITECTING)
    expect(mockHost.log).toHaveBeenCalledWith('info', expect.stringContaining('Enter State: ARCHITECTING'));
  });

  it('should invoke onStateChange callback', async () => {
    const onStateChange = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    await workflow.start(engineState, onStateChange);
    expect(onStateChange).toHaveBeenCalled();
  });

  it('should fail recovery if error target state is not registered', async () => {
    const archRun = jest.fn<StateRun>().mockRejectedValue(new Error('Test Error'));
    setupMockState('ARCHITECTING', archRun);

    // Graph says recover to RECOVERY_STATE
    mockGraph.getErrorTarget.mockReturnValue('RECOVERY_STATE');
    // But RECOVERY_STATE is not registered

    await workflow.start(engineState);

    // Should bubble up error
    expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Workflow Failed'));
  });

  it('should fail if implicit COMPLETED state is missing', async () => {
    // We need to unregister COMPLETED state for this test, or ensure it's not found
    // Since we mock states map in beforeEach, we can just NOT register it here?
    // But beforeEach registers 'COMPLETED'.
    // We can clear the map if we had access, but 'workflow.states' is private.
    // Hack: Rename mocked COMPLETED state in map?
    // Or simpler: Mock 'COMPLETED' state registration to NOT happen or happen with different name?
    // We can't easily undo beforeEach.
    // Instead, we can force get('COMPLETED') to return undefined by mocking the map.get call if we could.
    // But 'workflow.states' is a real Map.

    // Alternative: Create a new workflow instance for this test without default states?
    // But 'Workflow' constructor calls 'registerDefaultStates'.

    // Okay, assuming 'COMPLETED' is always there, this branch might be unreachable in normal usage unless 'registerDefaultStates' changes.
    // But we can check if 'this.states.delete' works?
    workflow.states.delete('COMPLETED');

    setupMockState('ARCHITECTING', jest.fn<StateRun>().mockResolvedValue(Signal.COMPLETE));
    mockGraph.getNextState.mockReturnValue(undefined); // No explicit next

    await workflow.start(engineState);

    expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('No valid next state found'));
  });
});
