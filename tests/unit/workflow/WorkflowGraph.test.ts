import { Signal, SignalType } from '../../../src/workflow/Signal.js';
import { DefaultWorkflowConfig, WorkflowConfig, WorkflowGraph } from '../../../src/workflow/WorkflowGraph.js';

describe('WorkflowGraph', () => {
  let graph: WorkflowGraph;

  beforeEach(() => {
    // Use default config for testing
    graph = new WorkflowGraph(DefaultWorkflowConfig);
  });

  it('should have initial state', () => {
    expect(graph.getInitialState()).toBe('ARCHITECTING');
  });

  it('should get next state for transition', () => {
    // ARCHITECTING (NEXT) -> PLANNING
    const next = graph.getNextState('ARCHITECTING', new Signal(SignalType.NEXT));
    expect(next).toBe('PLANNING');
  });

  it('should return undefined for invalid transition', () => {
    const next = graph.getNextState('ARCHITECTING', new Signal(SignalType.FAIL));
    expect(next).toBeUndefined();
  });

  it('should get configuration', () => {
    expect(graph.getConfig()).toBe(DefaultWorkflowConfig);
  });

  it('should get error target', () => {
    // Default config doesn't have onError, should return undefined
    expect(graph.getErrorTarget('ARCHITECTING')).toBeUndefined();

    // Create graph with onError
    const errorConfig: WorkflowConfig = {
      initialState: 'START',
      states: [
        {
          name: 'START',
          transitions: [],
          onError: 'ERROR_STATE',
        },
      ],
    };
    const errorGraph = new WorkflowGraph(errorConfig);
    expect(errorGraph.getErrorTarget('START')).toBe('ERROR_STATE');
  });

  it('should return undefined for missing state in transitionMap', () => {
    expect(graph.getNextState('MISSING', new Signal(SignalType.NEXT))).toBeUndefined();
  });
});
