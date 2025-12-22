import { Driver } from '../domain/Driver.js';
import { Registry } from '../domain/Registry.js';
import { RuntimeHost } from '../domain/RuntimeHost.js';
import path from 'path';
import fs from 'fs-extra';

export class DriverRegistry extends Registry<Driver> {
    private defaultPlugin: Driver | undefined;

    constructor(protected host: RuntimeHost, protected config: any) {
        super();
    }

    register(plugin: Driver, isDefault: boolean = false): void {
        this.items.set(plugin.name, plugin);
        if (isDefault) {
            this.defaultPlugin = plugin;
        }
    }

    getDefault(): Driver | undefined {
        return this.defaultPlugin;
    }

    async load(dir: string): Promise<void> {
        if (!fs.existsSync(dir)) return;

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
                if (file.endsWith('.d.ts')) continue;

                try {
                    const module = await import(file);
                    for (const key in module) {
                        const ExportedClass = module[key];
                        if (typeof ExportedClass === 'function') {
                            try {
                                const instance = new ExportedClass(this.host, this.config);
                                if (this.isDriver(instance)) {
                                    if (await instance.isSupported()) {
                                        const isDefault = instance.name === 'gemini';
                                        this.host.log('debug', `Registering driver: ${instance.name} (Default: ${isDefault})`);
                                        this.register(instance, isDefault);
                                    } else {
                                        this.host.log('debug', `Driver '${instance.name}' is not supported by current environment.`);
                                    }
                                }
                            } catch (e) {
                                // Ignore classes that fail to instantiate
                            }
                        }
                    }
                } catch (e) {
                    this.host.log('error', `Failed to load driver from ${file}: ${(e as Error).message}`);
                }
            }
        }
    }

    private isDriver(obj: any): obj is Driver {
        return obj && typeof obj.name === 'string' && typeof obj.execute === 'function' && typeof obj.isSupported === 'function';
    }
}
