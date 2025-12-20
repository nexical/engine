import { Driver } from '../interfaces/Driver.js';
import { Registry } from '../models/Registry.js';
import { SkillService } from '../services/SkillService.js';
import path from 'path';
import fs from 'fs-extra';
import debug from 'debug';

const log = debug('driver-registry');

export class DriverRegistry extends Registry<Driver> {
    private defaultPlugin: Driver | undefined;
    private skillService = new SkillService();

    register(plugin: Driver, isDefault: boolean = false): void {
        super.register(plugin);
        if (isDefault) {
            this.defaultPlugin = plugin;
        }
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
