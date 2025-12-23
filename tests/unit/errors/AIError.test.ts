
import { AIError } from '../../../src/errors/AIError.js';

describe('AIError', () => {
    it('should create refusal error', () => {
        const error = AIError.refusal('I cannot do that');
        expect(error).toBeInstanceOf(AIError);
        expect(error.code).toBe('MODEL_REFUSAL');
        expect(error.message).toBe('I cannot do that');
    });

    it('should create context limit error', () => {
        const error = AIError.contextLimit('Too long', 1000);
        expect(error).toBeInstanceOf(AIError);
        expect(error.code).toBe('CONTEXT_LIMIT_EXCEEDED');
        expect(error.metadata).toEqual({ tokens: 1000 });
    });

    it('should create parse error', () => {
        const error = AIError.parseError('Invalid JSON', '{ foo: }');
        expect(error).toBeInstanceOf(AIError);
        expect(error.code).toBe('PARSE_ERROR');
        expect(error.metadata).toEqual({ rawOutput: '{ foo: }' });
    });

    it('should use default code and metadata', () => {
        const error = new AIError('Generic AI error');
        expect(error.code).toBe('AI_ERROR');
        expect(error.metadata).toEqual({});
    });

    it('should have correct name property', () => {
        const error = new AIError('test');
        expect(error.name).toBe('AIError');
    });
});
