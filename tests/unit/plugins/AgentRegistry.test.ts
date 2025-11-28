import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import { AgentRegistry } from '../../../src/plugins/AgentRegistry.js';
import { AgentPlugin } from '../../../src/models/Plugins.js';

describe('AgentRegistry', () => {
    let registry: AgentRegistry;
    let mockPlugin: AgentPlugin;

    beforeEach(() => {
        registry = new AgentRegistry();
        mockPlugin = {
            name: 'test-agent',
            description: 'Test Agent',
            execute: jest.fn()
        } as any;
    });

    it('should register a plugin', () => {
        registry.register(mockPlugin);
        expect(registry.get('test-agent')).toBe(mockPlugin);
    });

    it('should register a default plugin', () => {
        registry.register(mockPlugin, true);
        expect(registry.getDefault()).toBe(mockPlugin);
    });

    it('should warn on duplicate registration', () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
        registry.register(mockPlugin);
        registry.register(mockPlugin);
        expect(consoleSpy).toHaveBeenCalledWith("Agent plugin 'test-agent' is already registered. Overwriting.");
        consoleSpy.mockRestore();
    });

    it('should return undefined for unknown plugin', () => {
        expect(registry.get('unknown')).toBeUndefined();
    });

    it('should return all plugins', () => {
        const plugin2 = { ...mockPlugin, name: 'agent2' };
        registry.register(mockPlugin);
        registry.register(plugin2);
        expect(registry.getAll()).toHaveLength(2);
        expect(registry.getAll()).toContain(mockPlugin);
        expect(registry.getAll()).toContain(plugin2);
    });
});
