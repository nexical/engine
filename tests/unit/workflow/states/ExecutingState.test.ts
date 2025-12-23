import { jest } from '@jest/globals';

import { Brain } from '../../../../src/agents/Brain.js';
import { DeveloperAgent } from '../../../../src/agents/DeveloperAgent.js';
import { IProject } from '../../../../src/domain/Project.js';
import { IRuntimeHost } from '../../../../src/domain/RuntimeHost.js';
import { EngineState } from '../../../../src/domain/State.js';
import { IWorkspace } from '../../../../src/domain/Workspace.js';
import { SignalDetectedError } from '../../../../src/errors/SignalDetectedError.js';
import { Signal, SignalType } from '../../../../src/workflow/Signal.js';
import { ExecutingState } from '../../../../src/workflow/states/ExecutingState.js';

describe('ExecutingState', () => {
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockBrain: jest.Mocked<Brain>;
  let mockWorkspace: jest.Mocked<IWorkspace>;
  let engineState: EngineState;
  let state: ExecutingState;
  let mockDeveloper: jest.Mocked<DeveloperAgent>;

  beforeEach(() => {
    mockHost = { log: jest.fn(), ask: jest.fn() } as unknown as jest.Mocked<IRuntimeHost>;
    mockBrain = {
      createDeveloper: jest.fn<Brain['createDeveloper']>(),
    } as unknown as jest.Mocked<Brain>;
    mockWorkspace = {
      getArchitecture: jest.fn(),
    } as unknown as jest.Mocked<IWorkspace>;

    engineState = new EngineState('session-id');
    engineState.user_prompt = 'Do something';
    engineState.interactive = true;

    mockDeveloper = {
      execute: jest.fn<DeveloperAgent['execute']>().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DeveloperAgent>;
    mockBrain.createDeveloper.mockReturnValue(mockDeveloper);
    state = new ExecutingState(mockBrain, {} as unknown as IProject, mockWorkspace, mockHost);
  });

  it('should have correct name', () => {
    expect(state.name).toBe('EXECUTING');
  });

  it('should execute and complete', async () => {
    const signal = await state.run(engineState);

    expect(mockDeveloper.execute).toHaveBeenCalled();
    expect(signal).toBe(Signal.COMPLETE);
  });

  it('should handle SignalDetectedError', async () => {
    const signal = new Signal(SignalType.FAIL, 'stop');
    mockDeveloper.execute.mockRejectedValue(new SignalDetectedError(signal));

    const result = await state.run(engineState);
    expect(result).toBe(signal);
  });

  it('should return fail on generic error', async () => {
    mockDeveloper.execute.mockRejectedValue(new Error('fail'));
    const signal = await state.run(engineState);
    expect(signal.type).toBe(SignalType.FAIL);
  });
});
