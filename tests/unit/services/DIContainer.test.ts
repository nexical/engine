
import { DIContainer } from '../../../src/services/DIContainer.js';
import { jest } from '@jest/globals';

describe('DIContainer', () => {
    let container: DIContainer;

    beforeEach(() => {
        container = new DIContainer();
    });

    it('should register and resolve instance', () => {
        const instance = { name: 'test' };
        container.register('service', instance);
        expect(container.resolve('service')).toBe(instance);
    });

    it('should register and resolve factory (singleton)', () => {
        const factory = jest.fn().mockReturnValue({ name: 'test' });
        container.registerFactory('factory', factory);

        const instance1 = container.resolve('factory');
        const instance2 = container.resolve('factory');

        expect(instance1).toEqual({ name: 'test' });
        expect(instance1).toBe(instance2); // Singleton
        expect(factory).toHaveBeenCalledTimes(1);
    });

    it('should throw if service not found', () => {
        expect(() => container.resolve('unknown')).toThrow();
    });

    it('should reset', () => {
        container.register('service', {});
        container.reset();
        expect(() => container.resolve('service')).toThrow();
    });
});
