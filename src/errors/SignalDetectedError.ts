import { Signal } from '../workflow/Signal.js';

export class SignalDetectedError extends Error {
    constructor(public signal: Signal) {
        super(`Signal detected: ${signal.type}`);
        this.name = 'SignalDetectedError';
    }
}
