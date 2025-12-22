import { Signal } from '../workflow/Signal.js';

export class SignalDetectedError extends Error {
    constructor(public signal: Signal, public taskId: string = '') {
        super(`Signal detected${taskId ? ` in task ${taskId}` : ''}: ${signal.type}`);
        this.name = 'SignalDetectedError';
    }
}
