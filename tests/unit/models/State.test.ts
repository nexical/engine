import { describe, it, expect, beforeEach } from '@jest/globals';
import { EngineState } from '../../../src/models/State.js';

describe('EngineState Model', () => {
    let state: EngineState;

    beforeEach(() => {
        state = new EngineState('test-session');
    });

    it('should initialize with correct defaults', () => {
        expect(state.session_id).toBe('test-session');
        expect(state.status).toBe('IDLE');
        expect(state.loop_count).toBe(0);
        expect(state.tasks.pending).toHaveLength(0);
        expect(state.tasks.completed).toHaveLength(0);
        expect(state.tasks.failed).toHaveLength(0);
    });

    it('should update status', () => {
        state.updateStatus('PLANNING');
        expect(state.status).toBe('PLANNING');
    });

    it('should increment loop count', () => {
        state.incrementLoop();
        expect(state.loop_count).toBe(1);
    });

    it('should record signal', () => {
        const signal = {
            type: 'USER_INTERVENTION' as any, // Cast if type is restricted
            source: 'user',
            reason: 'test',
            timestamp: 'now'
        };
        state.recordSignal(signal);
        expect(state.last_signal).toBe(signal);
    });

    it('should serialize and deserialize', () => {
        state.updateStatus('EXECUTING');
        state.incrementLoop();

        const yaml = state.toYaml();
        const loaded = EngineState.fromYaml(yaml);

        expect(loaded.session_id).toBe('test-session');
        expect(loaded.status).toBe('EXECUTING');
        expect(loaded.loop_count).toBe(1);
    });
});
