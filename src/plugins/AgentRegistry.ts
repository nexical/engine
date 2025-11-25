import { AgentPlugin, PluginRegistry } from '../models/Plugins.js';

export class AgentRegistry implements PluginRegistry<AgentPlugin> {
    private plugins: Map<string, AgentPlugin> = new Map();
    private defaultPlugin: AgentPlugin | undefined;

    register(plugin: AgentPlugin, isDefault: boolean = false): void {
        if (this.plugins.has(plugin.name)) {
            console.warn(`Agent plugin '${plugin.name}' is already registered. Overwriting.`);
        }
        this.plugins.set(plugin.name, plugin);
        if (isDefault) {
            this.defaultPlugin = plugin;
        }
    }

    get(name: string): AgentPlugin | undefined {
        return this.plugins.get(name);
    }

    getAll(): AgentPlugin[] {
        return Array.from(this.plugins.values());
    }

    getDefault(): AgentPlugin | undefined {
        return this.defaultPlugin;
    }
}
