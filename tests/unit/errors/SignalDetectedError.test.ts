
import { SignalDetectedError } from '../../../src/errors/SignalDetectedError.js';
import { Signal, SignalType } from '../../../src/workflow/Signal.js';

describe('SignalDetectedError', () => {
    it('should create signal detected error without taskId', () => {
        const signal = new Signal(SignalType.FAIL, 'failed');
        const error = new SignalDetectedError(signal);
        expect(error.message).toBe('Signal detected: FAIL');
        expect(error.taskId).toBe('');
    });

    it('should create signal detected error with taskId', () => {
        const signal = new Signal(SignalType.FAIL, 'failed');
        const error = new SignalDetectedError(signal, 'task-123');
        expect(error.message).toBe('Signal detected in task task-123: FAIL');
        expect(error.taskId).toBe('task-123');
    });

    it('should have correct name property', () => {
        const signal = new Signal(SignalType.FAIL, 'failed');
        const error = new SignalDetectedError(signal);
        expect(error.name).toBe('SignalDetectedError');
    });
});
