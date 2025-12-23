import { jest } from '@jest/globals';

import { Brain } from '../../../../src/agents/Brain.js';
import { IProject } from '../../../../src/domain/Project.js';
import { IRuntimeHost } from '../../../../src/domain/RuntimeHost.js';
import { EngineState } from '../../../../src/domain/State.js';
import { IWorkspace } from '../../../../src/domain/Workspace.js';
import { Signal } from '../../../../src/workflow/Signal.js';
import { CompletedState } from '../../../../src/workflow/states/CompletedState.js';

describe('CompletedState', () => {
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockBrain: jest.Mocked<Brain>;
  let mockWorkspace: jest.Mocked<IWorkspace>;
  let engineState: EngineState;
  let state: CompletedState;

  beforeEach(() => {
    mockHost = { log: jest.fn(), ask: jest.fn() } as unknown as jest.Mocked<IRuntimeHost>;
    mockBrain = {
      createArchitect: jest.fn(),
      createPlanner: jest.fn(),
      createDeveloper: jest.fn(),
    } as unknown as jest.Mocked<Brain>;
    mockWorkspace = {
      getArchitecture: jest.fn(),
    } as unknown as jest.Mocked<IWorkspace>;

    engineState = new EngineState('session-id');
    state = new CompletedState(mockBrain, {} as unknown as IProject, mockWorkspace, mockHost);
  });

  it('should have correct name', () => {
    expect(state.name).toBe('COMPLETED');
  });

  it('should return COMPLETE', async () => {
    const signal = await state.run(engineState);
    expect(signal).toBe(Signal.COMPLETE);
  });
});
