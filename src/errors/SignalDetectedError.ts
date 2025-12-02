import { Signal } from '../models/State.js';

export class SignalDetectedError extends Error {
    constructor(public signal: Signal) {
        super(`Signal detected: ${signal.type} from ${signal.source}`);
        this.name = 'SignalDetectedError';
    }
}
