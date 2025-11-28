import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import { CommandRegistry } from '../../../src/plugins/CommandRegistry.js';
import { CommandPlugin } from '../../../src/models/Plugins.js';

describe('CommandRegistry', () => {
    let registry: CommandRegistry;
    let mockPlugin: CommandPlugin;

    beforeEach(() => {
        registry = new CommandRegistry();
        mockPlugin = {
            name: 'test-command',
            description: 'Test Command',
            execute: jest.fn()
        } as any;
    });

    it('should register a plugin', () => {
        registry.register(mockPlugin);
        expect(registry.get('test-command')).toBe(mockPlugin);
    });

    it('should warn on duplicate registration', () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
        registry.register(mockPlugin);
        registry.register(mockPlugin);
        expect(consoleSpy).toHaveBeenCalledWith("Command plugin 'test-command' is already registered. Overwriting.");
        consoleSpy.mockRestore();
    });

    it('should return undefined for unknown plugin', () => {
        expect(registry.get('unknown')).toBeUndefined();
    });

    it('should return all plugins', () => {
        const plugin2 = { ...mockPlugin, name: 'command2' };
        registry.register(mockPlugin);
        registry.register(plugin2);
        expect(registry.getAll()).toHaveLength(2);
        expect(registry.getAll()).toContain(mockPlugin);
        expect(registry.getAll()).toContain(plugin2);
    });
});
