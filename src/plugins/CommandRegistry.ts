import { CommandPlugin, PluginRegistry } from '../data_models/Plugins.js';

export class CommandRegistry implements PluginRegistry<CommandPlugin> {
    private plugins: Map<string, CommandPlugin> = new Map();

    register(plugin: CommandPlugin): void {
        if (this.plugins.has(plugin.name)) {
            console.warn(`Command plugin '${plugin.name}' is already registered. Overwriting.`);
        }
        this.plugins.set(plugin.name, plugin);
    }

    get(name: string): CommandPlugin | undefined {
        return this.plugins.get(name);
    }

    getAll(): CommandPlugin[] {
        return Array.from(this.plugins.values());
    }
}
