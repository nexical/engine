import path from 'path';
import fs from 'fs-extra';
import { readdir } from 'fs/promises';
import debug from 'debug';
import { Command } from '../models/Command.js';
import { Registry, BaseRegistry } from '../models/Registry.js';

const log = debug('command-registry');

export class CommandRegistry extends BaseRegistry implements Registry<Command> {
    private commands: Map<string, Command> = new Map();

    register(command: Command): void {
        if (this.commands.has(command.name)) {
            console.warn(`Command '${command.name}' is already registered. Overwriting.`);
        }
        this.commands.set(command.name, command);
    }

    get(name: string): Command | undefined {
        return this.commands.get(name);
    }

    getAll(): Command[] {
        return Array.from(this.commands.values());
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
                                if (this.isCommand(instance)) {
                                    log(`Registering command: ${instance.name}`);
                                    this.register(instance);
                                }
                            } catch (e) {
                                // Ignore if instantiation fails (e.g. not a class or needs args)
                            }
                        }
                    }
                } catch (e) {
                    console.error(`Failed to load command from ${file}:`, e);
                }
            }
        }
    }

    private isCommand(obj: any): obj is Command {
        return obj && typeof obj.name === 'string' && typeof obj.execute === 'function';
    }
}
