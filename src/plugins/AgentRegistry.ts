import path from 'path';
import fs from 'fs-extra';
import { readdir } from 'fs/promises';
import debug from 'debug';
import { AgentPlugin, PluginRegistry } from '../models/Plugins.js';

const log = debug('agent-registry');

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

    async load(dir: string): Promise<void> {
        if (!fs.existsSync(dir)) return;

        const files = await readdir(dir);
        for (const file of files) {
            if (file.endsWith('.ts') || file.endsWith('.js')) {
                const modulePath = path.join(dir, file);
                try {
                    const module = await import(modulePath);
                    for (const key in module) {
                        const ExportedClass = module[key];
                        if (typeof ExportedClass === 'function') {
                            try {
                                const instance = new ExportedClass(this);
                                if (this.isAgentPlugin(instance)) {
                                    const isDefault = instance.name === 'cli';
                                    log(`Registering agent plugin: ${instance.name} (Default: ${isDefault})`);
                                    this.register(instance, isDefault);
                                }
                            } catch (e) {
                                // Ignore
                            }
                        }
                    }
                } catch (e) {
                    console.error(`Failed to load agent plugin from ${file}:`, e);
                }
            }
        }
    }

    private isAgentPlugin(obj: any): obj is AgentPlugin {
        return obj && typeof obj.name === 'string' && typeof obj.execute === 'function';
    }
}
