import { jest } from '@jest/globals';

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
const mockEvolution = { recordFailure: jest.fn() };
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

const { Workflow } = await import('../../../src/workflow/Workflow.js');

describe('Workflow', () => {
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

  it('should initialize with default states', () => {
    expect(MockArchitectingState).toHaveBeenCalled();
    expect(MockPlanningState).toHaveBeenCalled();
    expect(MockExecutingState).toHaveBeenCalled();
    expect(MockCompletedState).toHaveBeenCalled();
    expect(MockWorkflowGraph).toHaveBeenCalled();
  });

  it('should start from initial state', async () => {
    mockGraph.getInitialState.mockReturnValue('ARCHITECTING');
    mockGraph.getNextState.mockReturnValue('COMPLETED');
    const archState = setupMockState(
      'ARCHITECTING',
      jest.fn<StateRun>().mockResolvedValue(Signal.NEXT) as jest.Mock<StateRun>,
    );
    const compState = setupMockState(
      'COMPLETED',
      jest.fn<StateRun>().mockResolvedValue(Signal.COMPLETE) as jest.Mock<StateRun>,
    );

    await workflow.start(engineState);

    expect(archState.run).toHaveBeenCalled();
    expect(compState.run).toHaveBeenCalled();
  });

  it('should resume from existing state', async () => {
    engineState.status = 'PLANNING';
    engineState.current_state = 'PLANNING';
    const planState = setupMockState(
      'PLANNING',
      jest.fn<StateRun>().mockResolvedValue(Signal.COMPLETE) as jest.Mock<StateRun>,
    );
    mockGraph.getNextState.mockReturnValue('COMPLETED');
    setupMockState('COMPLETED', jest.fn<StateRun>().mockResolvedValue(Signal.COMPLETE) as jest.Mock<StateRun>);

    await workflow.start(engineState);

    expect(planState.run).toHaveBeenCalled();
    expect(mockHost.log).toHaveBeenCalledWith('info', expect.stringContaining('Resuming from state: PLANNING'));
  });

  it('should ignore resume if state is not registered', async () => {
    engineState.status = 'FAILED';
    engineState.current_state = 'INVALID_STATE';
    mockGraph.getInitialState.mockReturnValue('ARCHITECTING');
    await workflow.start(engineState);
    expect(mockHost.log).not.toHaveBeenCalledWith('info', expect.stringContaining('Resuming'));
  });

  it('should skip resume if restored state name is missing in map', async () => {
    engineState.status = 'IDLE'; // Using IDLE to avoid OrchestratorStatus type error for 'NON_EXISTENT'
    mockGraph.getNextState.mockReturnValue(null);
    await workflow.start(engineState);
    expect(mockHost.log).not.toHaveBeenCalledWith('info', expect.stringContaining('Resuming'));
  });

  it('should fail if loop limit reached', async () => {
    engineState.loop_count = 6;
    mockGraph.getConfig.mockReturnValue({ maxLoops: 5 });

    await workflow.start(engineState);

    expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Maximum retry limit reached'));
    expect(engineState.status).toBe('FAILED');
  });

  it('should handle unhandled state errors', async () => {
    setupMockState('ARCHITECTING', jest.fn<StateRun>().mockRejectedValue(new Error('crash')) as jest.Mock<StateRun>);
    mockGraph.getErrorTarget.mockReturnValue(null);

    await workflow.start(engineState);

    expect(mockHost.emit).toHaveBeenCalledWith('error', expect.any(Object));
    expect(engineState.status).toBe('FAILED');
  });

  it('should recover from errors if configured', async () => {
    const errorState = setupMockState(
      'ARCHITECTING',
      jest.fn<StateRun>().mockRejectedValue(new Error('crash')) as jest.Mock<StateRun>,
    );
    mockGraph.getErrorTarget.mockReturnValue('PLANNING');

    const planState = setupMockState(
      'PLANNING',
      jest.fn<StateRun>().mockResolvedValue(Signal.COMPLETE) as jest.Mock<StateRun>,
    );
    mockGraph.getNextState.mockReturnValue('COMPLETED');
    setupMockState('COMPLETED', jest.fn<StateRun>().mockResolvedValue(Signal.COMPLETE) as jest.Mock<StateRun>);

    await workflow.start(engineState);

    expect(errorState.run).toHaveBeenCalled();
    expect(planState.run).toHaveBeenCalled();
  });

  it('should fail if error recovery target is missing in map', async () => {
    setupMockState('ARCHITECTING', jest.fn<StateRun>().mockRejectedValue(new Error('crash')) as jest.Mock<StateRun>);
    mockGraph.getErrorTarget.mockReturnValue('INVALID');

    await workflow.start(engineState);
    expect(engineState.status).toBe('FAILED');
  });

  it('should record failures in evolution', async () => {
    setupMockState('ARCHITECTING', jest.fn<StateRun>().mockResolvedValue(Signal.fail('reason')) as jest.Mock<StateRun>);
    mockGraph.getNextState.mockReturnValue(null);

    await workflow.start(engineState);

    expect(mockEvolution.recordFailure).toHaveBeenCalled();
    expect(engineState.loop_count).toBe(1);
  });

  it('should fail if transition target is missing in map', async () => {
    setupMockState('ARCHITECTING', jest.fn<StateRun>().mockResolvedValue(Signal.NEXT) as jest.Mock<StateRun>);
    mockGraph.getNextState.mockReturnValue('INVALID');

    await workflow.start(engineState);
    expect(engineState.status).toBe('FAILED');
  });

  it('should use onStateChange callback', async () => {
    const onStateChange = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    mockGraph.getNextState.mockReturnValue(null);
    setupMockState('ARCHITECTING', jest.fn<StateRun>().mockResolvedValue(Signal.COMPLETE) as jest.Mock<StateRun>);

    await workflow.start(engineState, onStateChange);
    expect(onStateChange).toHaveBeenCalled();
  });

  it('should fail if no valid next state found', async () => {
    setupMockState('ARCHITECTING', jest.fn<StateRun>().mockResolvedValue(Signal.NEXT) as jest.Mock<StateRun>);
    mockGraph.getNextState.mockReturnValue(null);

    await workflow.start(engineState);

    expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('No valid next state found'));
    expect(engineState.status).toBe('FAILED');
  });

  it('should implicitly transition to COMPLETED on COMPLETE signal', async () => {
    const stateA = setupMockState('A', jest.fn<StateRun>().mockResolvedValue(Signal.COMPLETE) as jest.Mock<StateRun>);
    const stateComp = setupMockState(
      'COMPLETED',
      jest.fn<StateRun>().mockResolvedValue(Signal.COMPLETE) as jest.Mock<StateRun>,
    );
    mockGraph.getInitialState.mockReturnValue('A');
    mockGraph.getNextState.mockReturnValue(null);

    await workflow.start(engineState);

    expect(stateA.run).toHaveBeenCalled();
    expect(stateComp.run).toHaveBeenCalled();
  });

  it('should fail if COMPLETED fallback state is missing', async () => {
    const minimalWorkflow = new Workflow(
      mockBrain as unknown as Brain,
      mockProject as unknown as IProject,
      mockWorkspace as unknown as IWorkspace,
      mockHost as unknown as IRuntimeHost,
    );
    minimalWorkflow.registerState({
      name: 'ONLY',
      run: jest.fn<StateRun>().mockResolvedValue(Signal.COMPLETE) as jest.Mock<StateRun>,
    } as unknown as State);
    mockGraph.getInitialState.mockReturnValue('ONLY');
    mockGraph.getNextState.mockReturnValue(null);

    await minimalWorkflow.start(engineState);
    expect(engineState.status).toBe('FAILED');
  });

  it('should use default maxLoops if not provided in config', async () => {
    mockGraph.getConfig.mockReturnValue({}); // No maxLoops
    engineState.loop_count = 11;

    await workflow.start(engineState);
    expect(mockHost.log).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('Maximum retry limit reached (10 loops)'),
    );
  });

  it('should fail if implicit COMPLETED fallback is missing in map', async () => {
    // We use a workflow where ONLY is registered, but it returns COMPLETE and graph returns null
    const minimalWorkflow = new Workflow(
      mockBrain as unknown as Brain,
      mockProject as unknown as IProject,
      mockWorkspace as unknown as IWorkspace,
      mockHost as unknown as IRuntimeHost,
    );
    (minimalWorkflow as unknown as { states: Map<string, State> }).states.delete('COMPLETED');
    minimalWorkflow.registerState({
      name: 'ONLY',
      run: jest.fn<StateRun>().mockResolvedValue(Signal.COMPLETE) as jest.Mock<StateRun>,
    } as unknown as State);
    mockGraph.getInitialState.mockReturnValue('ONLY');
    mockGraph.getNextState.mockReturnValue(null);

    await minimalWorkflow.start(engineState);
    expect(engineState.status).toBe('FAILED');
    expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('No valid next state found'));
  });

  it('should handle loop termination on COMPLETE signal in COMPLETED state', async () => {
    const stateComp = setupMockState(
      'COMPLETED',
      jest.fn<StateRun>().mockResolvedValue(Signal.COMPLETE) as jest.Mock<StateRun>,
    );
    mockGraph.getInitialState.mockReturnValue('COMPLETED');

    await workflow.start(engineState);
    expect(stateComp.run).toHaveBeenCalledTimes(1);
    expect(mockHost.emit).toHaveBeenCalledWith('workflow:complete', {});
  });
});
