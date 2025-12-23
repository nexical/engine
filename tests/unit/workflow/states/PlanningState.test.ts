
import { jest } from '@jest/globals';
import { PlanningState } from '../../../../src/workflow/states/PlanningState.js';
import { RuntimeHost } from '../../../../src/domain/RuntimeHost.js';
import { Brain } from '../../../../src/agents/Brain.js';
import { Workspace } from '../../../../src/domain/Workspace.js';
import { EngineState } from '../../../../src/domain/State.js';
import { Signal, SignalType } from '../../../../src/workflow/Signal.js';

describe('PlanningState', () => {
    let mockHost: jest.Mocked<RuntimeHost>;
    let mockBrain: jest.Mocked<Brain>;
    let mockWorkspace: jest.Mocked<Workspace>;
    let engineState: EngineState;
    let state: PlanningState;
    let mockPlanner: any;

    beforeEach(() => {
        mockHost = { log: jest.fn(), ask: jest.fn() } as unknown as jest.Mocked<RuntimeHost>;
        mockBrain = {
            createPlanner: jest.fn(),
        } as unknown as jest.Mocked<Brain>;
        mockWorkspace = {
            getArchitecture: jest.fn()
        } as unknown as jest.Mocked<Workspace>;

        engineState = new EngineState('session-id');
        engineState.user_prompt = "Do something";
        engineState.interactive = true;

        mockPlanner = { plan: jest.fn().mockResolvedValue(undefined) };
        mockBrain.createPlanner.mockReturnValue(mockPlanner);
        state = new PlanningState(mockBrain, {} as any, mockWorkspace, mockHost);
    });

    it('should have correct name', () => {
        expect(state.name).toBe('PLANNING');
    });

    it('should fail if no architecture', async () => {
        mockWorkspace.getArchitecture.mockResolvedValue(null as any);
        const signal = await state.run(engineState);
        expect(signal.type).toBe(SignalType.FAIL);
    });

    it('should execute plan and proceed', async () => {
        mockWorkspace.getArchitecture.mockResolvedValue({} as any);
        const signal = await state.run(engineState);
        expect(mockPlanner.plan).toHaveBeenCalled();
        expect(signal).toBe(Signal.NEXT);
    });

    it('should handle planning error', async () => {
        mockWorkspace.getArchitecture.mockResolvedValue({} as any);
        mockPlanner.plan.mockRejectedValue(new Error('crash'));
        const signal = await state.run(engineState);
        expect(signal.type).toBe(SignalType.FAIL);
        expect(signal.reason).toContain('Planning failed');
    });

    it('should return replan signal if feedback given on plan', async () => {
        mockWorkspace.getArchitecture.mockResolvedValue({} as any);
        (mockHost.ask as jest.Mock).mockResolvedValue('revise it');
        const signal = await state.run(engineState);
        expect(signal.type).toBe(SignalType.REPLAN);
        expect(signal.metadata).toEqual({ feedback: 'revise it' });
    });
});
