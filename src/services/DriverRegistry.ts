import path from 'path';
import fs from 'fs-extra';
import { readdir } from 'fs/promises';
import debug from 'debug';
import { Driver, Skills } from '../models/Driver.js';
import { Registry, BaseRegistry } from '../models/Registry.js';
import { SkillService } from './SkillService.js';

const log = debug('driver-registry');

export class DriverRegistry extends BaseRegistry implements Registry<Driver> {
    private plugins: Map<string, Driver> = new Map();
    private defaultPlugin: Driver | undefined;
    private skillService = new SkillService();

    register(plugin: Driver, isDefault: boolean = false): void {
        if (this.plugins.has(plugin.name)) {
            console.warn(`Driver '${plugin.name}' is already registered. Overwriting.`);
        }
        this.plugins.set(plugin.name, plugin);
        if (isDefault) {
            this.defaultPlugin = plugin;
        }
    }

    get(name: string): Driver | undefined {
        return this.plugins.get(name);
    }

    getAll(): Driver[] {
        return Array.from(this.plugins.values());
    }

    getDefault(): Driver | undefined {
        return this.defaultPlugin;
    }

    async load(dir: string): Promise<void> {
        if (!fs.existsSync(dir)) return;

        const skills = await this.skillService.getSkills();

        async function getFiles(dir: string): Promise<string[]> {
            const dirents = await fs.readdir(dir, { withFileTypes: true });
            const files = await Promise.all(dirents.map((dirent) => {
                const res = path.resolve(dir, dirent.name);
                return dirent.isDirectory() ? getFiles(res) : res;
            }));
            return Array.prototype.concat(...files);
        }

        const files = await getFiles(dir);

        for (const file of files) {
            if (file.endsWith('.ts') || file.endsWith('.js')) {
                // Ignore definition files
                if (file.endsWith('.d.ts')) continue;

                try {
                    const module = await import(file);
                    for (const key in module) {
                        const ExportedClass = module[key];
                        if (typeof ExportedClass === 'function') {
                            try {
                                const instance = new ExportedClass(this.core);
                                if (this.isDriver(instance)) {
                                    if (instance.isSupported(skills)) {
                                        const isDefault = instance.name === 'cli';
                                        log(`Registering driver: ${instance.name} (Default: ${isDefault})`);
                                        this.register(instance, isDefault);
                                    } else {
                                        log(`Driver '${instance.name}' is not supported by current environment.`);
                                    }
                                }
                            } catch (e) {
                                // Ignore classes that fail to instantiate (e.g. abstract classes)
                            }
                        }
                    }
                } catch (e) {
                    console.error(`Failed to load driver from ${file}:`, e);
                }
            }
        }
    }

    private isDriver(obj: any): obj is Driver {
        return obj && typeof obj.name === 'string' && typeof obj.execute === 'function' && typeof obj.isSupported === 'function';
    }
}
