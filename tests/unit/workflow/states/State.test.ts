import { jest } from '@jest/globals';

import { Brain } from '../../../../src/agents/Brain.js';
import { RuntimeHost } from '../../../../src/domain/RuntimeHost.js';
import { EngineState } from '../../../../src/domain/State.js';
import { Workspace } from '../../../../src/domain/Workspace.js';
import { Signal } from '../../../../src/workflow/Signal.js';
import { State } from '../../../../src/workflow/states/State.js';

class TestState extends State {
  get name(): string {
    return 'TEST';
  }
  async run(state: EngineState): Promise<Signal> {
    return Signal.NEXT;
  }

  // Expose protected method for testing
  public async callAskApproval(state: EngineState, msg: string, fail: Signal, replan: (f: string) => Signal) {
    return this.askApproval(state, msg, fail, replan);
  }
}

describe('State', () => {
  let mockHost: jest.Mocked<RuntimeHost>;
  let mockBrain: jest.Mocked<Brain>;
  let mockWorkspace: jest.Mocked<Workspace>;
  let engineState: EngineState;
  let state: TestState;

  beforeEach(() => {
    mockHost = { log: jest.fn(), ask: jest.fn() } as unknown as jest.Mocked<RuntimeHost>;
    mockBrain = {} as any;
    mockWorkspace = {} as any;
    engineState = new EngineState('session-id');
    engineState.interactive = true;
    state = new TestState(mockBrain, {} as any, mockWorkspace, mockHost);
  });

  it('should return null in askApproval if not interactive', async () => {
    engineState.interactive = false;
    const result = await state.callAskApproval(engineState, 'msg', Signal.NEXT, (f: string) => Signal.NEXT);
    expect(result).toBeNull();
  });

  it('should handle yes response in askApproval', async () => {
    (mockHost.ask as jest.Mock).mockResolvedValue('yes');
    const result = await state.callAskApproval(engineState, 'msg', Signal.NEXT, (f: string) => Signal.fail('replan'));
    expect(result).toBeNull();
  });

  it('should handle feedback response in askApproval', async () => {
    (mockHost.ask as jest.Mock).mockResolvedValue('revise it');
    const result = await state.callAskApproval(engineState, 'msg', Signal.NEXT, (f: string) => Signal.fail(f));
    expect(result?.reason).toBe('revise it');
  });

  it('should handle false response in askApproval', async () => {
    (mockHost.ask as jest.Mock).mockResolvedValue(false);
    const result = await state.callAskApproval(engineState, 'msg', Signal.fail('refused'), (f: string) => Signal.NEXT);
    expect(result?.reason).toBe('refused');
  });
});
