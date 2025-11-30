import path from 'path';
import fs from 'fs-extra';
import { readdir } from 'fs/promises';
import debug from 'debug';
import { CommandPlugin, PluginRegistry, BaseRegistry } from '../models/Plugins.js';

const log = debug('command-registry');

export class CommandRegistry extends BaseRegistry implements PluginRegistry<CommandPlugin> {
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
                                const instance = new ExportedClass(this.core);
                                if (this.isCommandPlugin(instance)) {
                                    log(`Registering command plugin: ${instance.name}`);
                                    this.register(instance);
                                }
                            } catch (e) {
                                // Ignore if instantiation fails (e.g. not a class or needs args)
                            }
                        }
                    }
                } catch (e) {
                    console.error(`Failed to load command plugin from ${file}:`, e);
                }
            }
        }
    }

    private isCommandPlugin(obj: any): obj is CommandPlugin {
        return obj && typeof obj.name === 'string' && typeof obj.execute === 'function';
    }
}
