import path from 'path';
import fs from 'fs-extra';
import { readdir } from 'fs/promises';
import debug from 'debug';
import { Skill, Capabilities } from '../models/Skill.js';
import { Registry, BaseRegistry } from '../models/Registry.js';
import { CapabilityService } from './CapabilityService.js';

const log = debug('skill-registry');

export class SkillRegistry extends BaseRegistry implements Registry<Skill> {
    private plugins: Map<string, Skill> = new Map();
    private defaultPlugin: Skill | undefined;
    private capabilityService = new CapabilityService();

    register(plugin: Skill, isDefault: boolean = false): void {
        if (this.plugins.has(plugin.name)) {
            console.warn(`Skill '${plugin.name}' is already registered. Overwriting.`);
        }
        this.plugins.set(plugin.name, plugin);
        if (isDefault) {
            this.defaultPlugin = plugin;
        }
    }

    get(name: string): Skill | undefined {
        return this.plugins.get(name);
    }

    getAll(): Skill[] {
        return Array.from(this.plugins.values());
    }

    getDefault(): Skill | undefined {
        return this.defaultPlugin;
    }

    async load(dir: string): Promise<void> {
        if (!fs.existsSync(dir)) return;

        const capabilities = await this.capabilityService.getCapabilities();

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
                                if (this.isSkill(instance)) {
                                    if (instance.isSupported(capabilities)) {
                                        const isDefault = instance.name === 'cli';
                                        log(`Registering skill: ${instance.name} (Default: ${isDefault})`);
                                        this.register(instance, isDefault);
                                    } else {
                                        log(`Skill '${instance.name}' is not supported by current environment.`);
                                    }
                                }
                            } catch (e) {
                                // Ignore
                            }
                        }
                    }
                } catch (e) {
                    console.error(`Failed to load skill from ${file}:`, e);
                }
            }
        }
    }

    private isSkill(obj: any): obj is Skill {
        return obj && typeof obj.name === 'string' && typeof obj.execute === 'function' && typeof obj.isSupported === 'function';
    }
}
