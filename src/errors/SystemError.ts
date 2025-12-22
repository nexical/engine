import { NexicalError } from './NexicalError.js';

export class SystemError extends NexicalError {
    constructor(message: string, code: string = 'SYSTEM_ERROR', metadata: Record<string, any> = {}) {
        super(message, code, metadata);
    }

    static io(message: string, path?: string): SystemError {
        return new SystemError(message, 'IO_ERROR', { path });
    }

    static network(message: string, url?: string): SystemError {
        return new SystemError(message, 'NETWORK_ERROR', { url });
    }
}
