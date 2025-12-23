
import { NexicalError } from '../../../src/errors/NexicalError.js';

class TestError extends NexicalError {
    constructor(message: string, code: string, metadata?: Record<string, any>) {
        if (metadata) {
            super(message, code, metadata);
        } else {
            super(message, code);
        }
    }
}

describe('NexicalError', () => {
    it('should have correct name property', () => {
        const error = new TestError('test', 'TEST_CODE');
        expect(error.name).toBe('TestError');
    });

    it('should hit default metadata branch if not provided', () => {
        const error = new TestError('test', 'CODE');
        expect(error.metadata).toEqual({});
    });

    it('should store metadata correctly', () => {
        const meta = { foo: 'bar' };
        const error = new TestError('test', 'CODE', meta);
        expect(error.metadata).toBe(meta);
    });

    it('should store message and code correctly', () => {
        const error = new TestError('the message', 'THE_CODE');
        expect(error.message).toBe('the message');
        expect(error.code).toBe('THE_CODE');
    });
});
