import { interpolate } from '../../../src/utils/interpolation.js';

describe('Interpolation Utility', () => {
    it('should replace placeholders with values from context', () => {
        const template = 'Hello, {name}!';
        const context = { name: 'World' };
        expect(interpolate(template, context)).toBe('Hello, World!');
    });

    it('should handle multiple placeholders', () => {
        const template = '{greeting}, {name}!';
        const context = { greeting: 'Hi', name: 'Alice' };
        expect(interpolate(template, context)).toBe('Hi, Alice!');
    });

    it('should handle missing keys gracefully (leave placeholder or replace with undefined string)', () => {
        // Current implementation replaces with "undefined" string if key is missing in context but present in template
        // because we iterate over context keys. Wait, the implementation iterates over context keys.
        // So if a key is NOT in context, it won't be replaced.
        const template = 'Hello, {name}!';
        const context = {};
        expect(interpolate(template, context)).toBe('Hello, {name}!');
    });

    it('should replace all occurrences of a placeholder', () => {
        const template = '{a} {b} {a}';
        const context = { a: '1', b: '2' };
        expect(interpolate(template, context)).toBe('1 2 1');
    });
});
