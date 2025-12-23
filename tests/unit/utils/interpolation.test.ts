
import { interpolate } from '../../../src/utils/interpolation.js';
import { jest } from '@jest/globals';

describe('Interpolation', () => {
    it('should interpolate variables', () => {
        const result = interpolate('Hello {name}', { name: 'World' });
        expect(result).toBe('Hello World');
    });

    it('should handle missing variables', () => {
        const result = interpolate('Hello {name}', {});
        expect(result).toBe('Hello {name}');
    });
});
