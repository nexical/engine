import { jest } from '@jest/globals';

import { Brain } from '../../../../src/agents/Brain.js';
import { IProject } from '../../../../src/domain/Project.js';
import { IRuntimeHost } from '../../../../src/domain/RuntimeHost.js';
import { EngineState } from '../../../../src/domain/State.js';
import { IWorkspace } from '../../../../src/domain/Workspace.js';
import { Signal } from '../../../../src/workflow/Signal.js';
import { State } from '../../../../src/workflow/states/State.js';

class TestState extends State {
  get name(): string {
    return 'TEST';
  }
  async run(_state: EngineState): Promise<Signal> {
    await Promise.resolve();
    return Signal.NEXT;
  }

  // Expose protected method for testing
  public async callAskApproval(
    state: EngineState,
    msg: string,
    fail: Signal,
    replan: (f: string) => Signal,
  ): Promise<Signal | null> {
    return this.askApproval(state, msg, fail, replan);
  }
}

describe('State', () => {
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockBrain: jest.Mocked<Brain>;
  let mockWorkspace: jest.Mocked<IWorkspace>;
  let engineState: EngineState;
  let state: TestState;

  beforeEach(() => {
    mockHost = { log: jest.fn(), ask: jest.fn() } as unknown as jest.Mocked<IRuntimeHost>;
    mockBrain = {} as unknown as jest.Mocked<Brain>;
    mockWorkspace = {} as unknown as jest.Mocked<IWorkspace>;
    engineState = new EngineState('session-id');
    engineState.interactive = true;
    state = new TestState(mockBrain, {} as unknown as IProject, mockWorkspace, mockHost);
  });

  it('should return null in askApproval if not interactive', async () => {
    engineState.interactive = false;
    const result = await state.callAskApproval(engineState, 'msg', Signal.NEXT, (_f: string) => Signal.NEXT);
    expect(result).toBeNull();
  });

  it('should handle yes response in askApproval', async () => {
    mockHost.ask.mockResolvedValue('yes');
    const result = await state.callAskApproval(engineState, 'msg', Signal.NEXT, (_f: string) => Signal.fail('replan'));
    expect(result).toBeNull();
  });

  it('should handle feedback response in askApproval', async () => {
    mockHost.ask.mockResolvedValue('revise it');
    const result = await state.callAskApproval(engineState, 'msg', Signal.NEXT, (f: string) => Signal.fail(f));
    expect(result?.reason).toBe('revise it');
  });

  it('should handle false response in askApproval', async () => {
    mockHost.ask.mockResolvedValue(false);
    const result = await state.callAskApproval(engineState, 'msg', Signal.fail('refused'), (_f: string) => Signal.NEXT);
    expect(result?.reason).toBe('refused');
  });
});
