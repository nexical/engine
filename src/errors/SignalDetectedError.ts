import { Signal } from '../interfaces/Signal.js';

export class SignalDetectedError extends Error {
    constructor(public signal: Signal) {
        super(`Signal detected: ${signal.type} from ${signal.source}`);
        this.name = 'SignalDetectedError';
    }
}
