
import { Result } from '../../../src/domain/Result.js';

describe('Result', () => {
    it('should create ok result', () => {
        const result = Result.ok(10);
        expect(result.isOk()).toBe(true);
        expect(result.isFail()).toBe(false);
        expect(result.unwrap()).toBe(10);
        expect(result.error()).toBeUndefined();
    });

    it('should create fail result', () => {
        const error = new Error('failed');
        const result = Result.fail(error);
        expect(result.isOk()).toBe(false);
        expect(result.isFail()).toBe(true);
        expect(result.error()).toBe(error);
        expect(() => result.unwrap()).toThrow(error);
    });

    it('should map value if ok', () => {
        const result = Result.ok(10);
        const mapped = result.map(x => x * 2);
        expect(mapped.unwrap()).toBe(20);
    });

    it('should propagate error on map if fail', () => {
        const error = new Error('failed');
        const result = Result.fail(error); // Type inference might need help or implicit 'any' for T
        const mapped = result.map(x => x);
        expect(mapped.isFail()).toBe(true);
        expect(mapped.error()).toBe(error);
    });
});
