import { jest } from '@jest/globals';

import { Brain } from '../../../../src/agents/Brain.js';
import { PlannerAgent } from '../../../../src/agents/PlannerAgent.js';
import { Architecture } from '../../../../src/domain/Architecture.js';
import { Plan } from '../../../../src/domain/Plan.js';
import { IProject } from '../../../../src/domain/Project.js';
import { IRuntimeHost } from '../../../../src/domain/RuntimeHost.js';
import { EngineState } from '../../../../src/domain/State.js';
import { IWorkspace } from '../../../../src/domain/Workspace.js';
import { Signal, SignalType } from '../../../../src/workflow/Signal.js';
import { PlanningState } from '../../../../src/workflow/states/PlanningState.js';

describe('PlanningState', () => {
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockBrain: jest.Mocked<Brain>;
  let mockWorkspace: jest.Mocked<IWorkspace>;
  let engineState: EngineState;
  let state: PlanningState;
  let mockPlanner: jest.Mocked<PlannerAgent>;

  beforeEach(() => {
    mockHost = { log: jest.fn(), ask: jest.fn() } as unknown as jest.Mocked<IRuntimeHost>;
    mockBrain = {
      createPlanner: jest.fn<Brain['createPlanner']>(),
    } as unknown as jest.Mocked<Brain>;
    mockWorkspace = {
      getArchitecture: jest.fn<IWorkspace['getArchitecture']>(),
    } as unknown as jest.Mocked<IWorkspace>;

    engineState = new EngineState('session-id');
    engineState.user_prompt = 'Do something';
    engineState.interactive = true;

    mockPlanner = {
      plan: jest.fn<PlannerAgent['plan']>().mockResolvedValue(new Plan('Test Plan')),
    } as unknown as jest.Mocked<PlannerAgent>;
    mockBrain.createPlanner.mockReturnValue(mockPlanner);
    state = new PlanningState(mockBrain, {} as unknown as IProject, mockWorkspace, mockHost);
  });

  it('should have correct name', () => {
    expect(state.name).toBe('PLANNING');
  });

  it('should fail if no architecture', async () => {
    mockWorkspace.getArchitecture.mockResolvedValue(null as unknown as Architecture);
    const signal = await state.run(engineState);
    expect(signal.type).toBe(SignalType.FAIL);
  });

  it('should execute plan and proceed', async () => {
    mockWorkspace.getArchitecture.mockResolvedValue({} as Architecture);
    const signal = await state.run(engineState);

    expect(mockPlanner.plan).toHaveBeenCalled();
    expect(signal).toBe(Signal.NEXT);
  });

  it('should handle planning error', async () => {
    mockWorkspace.getArchitecture.mockResolvedValue({} as Architecture);
    mockPlanner.plan.mockRejectedValue(new Error('crash') as never);
    const signal = await state.run(engineState);
    expect(signal.type).toBe(SignalType.FAIL);
    expect(signal.reason).toContain('Planning failed');
  });

  it('should return replan signal if feedback given on plan', async () => {
    mockWorkspace.getArchitecture.mockResolvedValue({} as Architecture);
    mockHost.ask.mockResolvedValue('revise it');
    const signal = await state.run(engineState);
    expect(signal.type).toBe(SignalType.REPLAN);
    expect(signal.metadata).toEqual({ feedback: 'revise it' });
  });
});
