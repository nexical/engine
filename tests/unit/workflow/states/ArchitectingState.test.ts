import { jest } from '@jest/globals';

import { ArchitectAgent } from '../../../../src/agents/ArchitectAgent.js';
import { Brain } from '../../../../src/agents/Brain.js';
import { Architecture } from '../../../../src/domain/Architecture.js';
import { IProject } from '../../../../src/domain/Project.js';
import { IRuntimeHost } from '../../../../src/domain/RuntimeHost.js';
import { EngineState } from '../../../../src/domain/State.js';
import { IWorkspace } from '../../../../src/domain/Workspace.js';
import { Signal, SignalType } from '../../../../src/workflow/Signal.js';
import { ArchitectingState } from '../../../../src/workflow/states/ArchitectingState.js';

describe('ArchitectingState', () => {
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockBrain: jest.Mocked<Brain>;
  let mockWorkspace: jest.Mocked<IWorkspace>;
  let engineState: EngineState;
  let state: ArchitectingState;
  let mockArchitect: jest.Mocked<ArchitectAgent>;

  beforeEach(() => {
    mockHost = { log: jest.fn(), ask: jest.fn() } as unknown as jest.Mocked<IRuntimeHost>;
    mockBrain = {
      createArchitect: jest.fn<Brain['createArchitect']>(),
    } as unknown as jest.Mocked<Brain>;
    mockWorkspace = {
      getArchitecture: jest.fn<IWorkspace['getArchitecture']>(),
      archiveArtifacts: jest.fn<IWorkspace['archiveArtifacts']>(),
    } as unknown as jest.Mocked<IWorkspace>;

    engineState = new EngineState('session-id');
    engineState.user_prompt = 'Do something';
    engineState.interactive = true;

    mockArchitect = {
      design: jest.fn<ArchitectAgent['design']>().mockResolvedValue({} as Architecture),
    } as unknown as jest.Mocked<ArchitectAgent>;
    mockBrain.createArchitect.mockReturnValue(mockArchitect);
    state = new ArchitectingState(mockBrain, {} as unknown as IProject, mockWorkspace, mockHost);
  });

  it('should have correct name', () => {
    expect(state.name).toBe('ARCHITECTING');
  });

  it('should execute design and proceed to NEXT', async () => {
    const signal = await state.run(engineState);

    expect(mockBrain.createArchitect).toHaveBeenCalledWith(mockWorkspace);

    expect(mockArchitect.design).toHaveBeenCalledWith('Do something');
    expect(signal).toBe(Signal.NEXT);
  });

  it('should handle approval rejection', async () => {
    mockHost.ask.mockResolvedValue(false);
    const signal = await state.run(engineState);
    expect(signal.type).toBe(SignalType.FAIL);
  });

  it('should handle approval feedback', async () => {
    mockHost.ask.mockResolvedValue('more details please');
    const signal = await state.run(engineState);
    expect(signal.type).toBe(SignalType.REARCHITECT);
    expect(signal.metadata).toEqual({ feedback: 'more details please' });
  });

  it('should return fail on error', async () => {
    mockArchitect.design.mockRejectedValue(new Error('fail') as never);
    const signal = await state.run(engineState);
    expect(signal.type).toBe(SignalType.FAIL);
  });
});
