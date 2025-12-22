import { NexicalError } from './NexicalError.js';

export class AIError extends NexicalError {
    constructor(message: string, code: string = 'AI_ERROR', metadata: Record<string, any> = {}) {
        super(message, code, metadata);
    }

    static refusal(message: string): AIError {
        return new AIError(message, 'MODEL_REFUSAL');
    }

    static contextLimit(message: string, tokens: number): AIError {
        return new AIError(message, 'CONTEXT_LIMIT_EXCEEDED', { tokens });
    }

    static parseError(message: string, rawOutput: string): AIError {
        return new AIError(message, 'PARSE_ERROR', { rawOutput });
    }
}
