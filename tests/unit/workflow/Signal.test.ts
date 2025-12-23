
import { Signal, SignalType } from '../../../src/workflow/Signal.js';

describe('Signal', () => {
    it('should create signal', () => {
        const signal = new Signal(SignalType.FAIL, 'reason');
        expect(signal.type).toBe('FAIL');
        expect(signal.reason).toBe('reason');
    });

    it('should use convenience methods', () => {
        const fail = Signal.fail('reason');
        expect(fail.type).toBe(SignalType.FAIL);
        expect(fail.reason).toBe('reason');

        const retry = Signal.retry('reason');
        expect(retry.type).toBe(SignalType.RETRY);

        const replan = Signal.replan('reason', { key: 'value' });
        expect(replan.type).toBe(SignalType.REPLAN);
        expect(replan.metadata).toEqual({ key: 'value' });

        const rearch = Signal.rearchitect('reason');
        expect(rearch.type).toBe(SignalType.REARCHITECT);
        expect(rearch.metadata).toEqual({});

        const replanNoMeta = Signal.replan('reason');
        expect(replanNoMeta.metadata).toEqual({});
    });

    it('should have static constants', () => {
        expect(Signal.NEXT.type).toBe(SignalType.NEXT);
        expect(Signal.COMPLETE.type).toBe(SignalType.COMPLETE);
        expect(Signal.WAIT.type).toBe(SignalType.WAIT);
    });
});
