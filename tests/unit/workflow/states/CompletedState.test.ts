
import { jest } from '@jest/globals';
import { CompletedState } from '../../../../src/workflow/states/CompletedState.js';
import { RuntimeHost } from '../../../../src/domain/RuntimeHost.js';
import { Brain } from '../../../../src/agents/Brain.js';
import { Workspace } from '../../../../src/domain/Workspace.js';
import { EngineState } from '../../../../src/domain/State.js';
import { Signal } from '../../../../src/workflow/Signal.js';

describe('CompletedState', () => {
    let mockHost: jest.Mocked<RuntimeHost>;
    let mockBrain: jest.Mocked<Brain>;
    let mockWorkspace: jest.Mocked<Workspace>;
    let engineState: EngineState;
    let state: CompletedState;

    beforeEach(() => {
        mockHost = { log: jest.fn(), ask: jest.fn() } as unknown as jest.Mocked<RuntimeHost>;
        mockBrain = {
            createArchitect: jest.fn(),
            createPlanner: jest.fn(),
            createDeveloper: jest.fn()
        } as unknown as jest.Mocked<Brain>;
        mockWorkspace = {
            getArchitecture: jest.fn()
        } as unknown as jest.Mocked<Workspace>;

        engineState = new EngineState('session-id');
        state = new CompletedState(mockBrain, {} as any, mockWorkspace, mockHost);
    });

    it('should have correct name', () => {
        expect(state.name).toBe('COMPLETED');
    });

    it('should return COMPLETE', async () => {
        const signal = await state.run(engineState);
        expect(signal).toBe(Signal.COMPLETE);
    });
});
