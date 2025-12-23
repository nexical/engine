
import { jest } from '@jest/globals';
import { ExecutingState } from '../../../../src/workflow/states/ExecutingState.js';
import { RuntimeHost } from '../../../../src/domain/RuntimeHost.js';
import { Brain } from '../../../../src/agents/Brain.js';
import { Workspace } from '../../../../src/domain/Workspace.js';
import { EngineState } from '../../../../src/domain/State.js';
import { Signal, SignalType } from '../../../../src/workflow/Signal.js';
import { SignalDetectedError } from '../../../../src/errors/SignalDetectedError.js';

describe('ExecutingState', () => {
    let mockHost: jest.Mocked<RuntimeHost>;
    let mockBrain: jest.Mocked<Brain>;
    let mockWorkspace: jest.Mocked<Workspace>;
    let engineState: EngineState;
    let state: ExecutingState;
    let mockDeveloper: any;

    beforeEach(() => {
        mockHost = { log: jest.fn(), ask: jest.fn() } as unknown as jest.Mocked<RuntimeHost>;
        mockBrain = {
            createDeveloper: jest.fn()
        } as unknown as jest.Mocked<Brain>;
        mockWorkspace = {
            getArchitecture: jest.fn()
        } as unknown as jest.Mocked<Workspace>;

        engineState = new EngineState('session-id');
        engineState.user_prompt = "Do something";
        engineState.interactive = true;

        mockDeveloper = { execute: jest.fn().mockResolvedValue(undefined) };
        mockBrain.createDeveloper.mockReturnValue(mockDeveloper);
        state = new ExecutingState(mockBrain, {} as any, mockWorkspace, mockHost);
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
