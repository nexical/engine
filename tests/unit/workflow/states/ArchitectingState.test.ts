
import { jest } from '@jest/globals';
import { ArchitectingState } from '../../../../src/workflow/states/ArchitectingState.js';
import { RuntimeHost } from '../../../../src/domain/RuntimeHost.js';
import { Brain } from '../../../../src/agents/Brain.js';
import { Workspace } from '../../../../src/domain/Workspace.js';
import { EngineState } from '../../../../src/domain/State.js';
import { Signal, SignalType } from '../../../../src/workflow/Signal.js';

describe('ArchitectingState', () => {
    let mockHost: jest.Mocked<RuntimeHost>;
    let mockBrain: jest.Mocked<Brain>;
    let mockWorkspace: jest.Mocked<Workspace>;
    let engineState: EngineState;
    let state: ArchitectingState;
    let mockArchitect: any;

    beforeEach(() => {
        mockHost = { log: jest.fn(), ask: jest.fn() } as unknown as jest.Mocked<RuntimeHost>;
        mockBrain = {
            createArchitect: jest.fn(),
        } as unknown as jest.Mocked<Brain>;
        mockWorkspace = {
            getArchitecture: jest.fn()
        } as unknown as jest.Mocked<Workspace>;

        engineState = new EngineState('session-id');
        engineState.user_prompt = "Do something";
        engineState.interactive = true;

        mockArchitect = { design: jest.fn().mockResolvedValue(undefined) };
        mockBrain.createArchitect.mockReturnValue(mockArchitect);
        state = new ArchitectingState(mockBrain, {} as any, mockWorkspace, mockHost);
    });

    it('should have correct name', () => {
        expect(state.name).toBe('ARCHITECTING');
    });

    it('should execute design and proceed to NEXT', async () => {
        const signal = await state.run(engineState);
        expect(mockBrain.createArchitect).toHaveBeenCalledWith(mockWorkspace);
        expect(mockArchitect.design).toHaveBeenCalledWith("Do something");
        expect(signal).toBe(Signal.NEXT);
    });

    it('should handle approval rejection', async () => {
        (mockHost.ask as jest.Mock).mockResolvedValue(false);
        const signal = await state.run(engineState);
        expect(signal.type).toBe(SignalType.FAIL);
    });

    it('should handle approval feedback', async () => {
        (mockHost.ask as jest.Mock).mockResolvedValue('more details please');
        const signal = await state.run(engineState);
        expect(signal.type).toBe(SignalType.REARCHITECT);
        expect(signal.metadata).toEqual({ feedback: 'more details please' });
    });

    it('should return fail on error', async () => {
        mockArchitect.design.mockRejectedValue(new Error('fail'));
        const signal = await state.run(engineState);
        expect(signal.type).toBe(SignalType.FAIL);
    });
});
