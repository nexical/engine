import { Driver } from '../domain/Driver.js';
import { Registry } from '../domain/Registry.js';
import { RuntimeHost } from '../domain/RuntimeHost.js';
import { IFileSystem } from '../domain/IFileSystem.js';
import { FileSystemService } from '../services/FileSystemService.js';
import { SystemError } from '../errors/SystemError.js';
import path from 'path';

export interface IDriverRegistry extends Registry<Driver> {
    register(plugin: Driver, isDefault?: boolean): void;
    getDefault(): Driver | undefined;
    load(dir: string): Promise<void>;
}

export class DriverRegistry extends Registry<Driver> implements IDriverRegistry {
    private defaultPlugin: Driver | undefined;
    private fileSystem: IFileSystem;

    constructor(protected host: RuntimeHost, protected config: any, fileSystem?: IFileSystem) {
        super();
        this.fileSystem = fileSystem || new FileSystemService(host);
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
        if (!this.fileSystem.isDirectory(dir)) {
            // Not an error if the directory doesn't exist, just nothing to load
            return;
        }

        const files = this.findDriversRecursive(dir);

        for (const file of files) {
            // Skip definition files and maps
            if (file.endsWith('.d.ts') || file.endsWith('.map')) {
                continue;
            }

            try {
                const module = await import(file);
                let loaded = false;
                for (const key in module) {
                    const ExportedClass = module[key];
                    if (typeof ExportedClass === 'function') {
                        try {
                            const instance = new ExportedClass(this.host, this.config, this.fileSystem);
                            if (this.isDriver(instance)) {
                                if (await instance.isSupported()) {
                                    const configuredDefault = this.config.defaultDriver || 'gemini';
                                    const isDefault = instance.name === configuredDefault;
                                    this.host.log('debug', `Registering driver: ${instance.name} (Default: ${isDefault})`);
                                    this.register(instance, isDefault);
                                    loaded = true;
                                } else {
                                    this.host.log('debug', `Driver '${instance.name}' is not supported by current environment.`);
                                }
                            }
                        } catch (e) {
                            // Helper classes or non-driver classes might fail instantiation
                        }
                    }
                }

                if (!loaded && file.match(/Driver\.(ts|js)$/)) {
                    this.host.log('warn', `No valid driver found in ${file}`);
                }

            } catch (e) {
                // Wrap in SystemError but log it instead of throwing to prevent stopping other drivers from loading
                const error = SystemError.io(`Failed to load driver from ${file}: ${(e as Error).message}`, file);
                this.host.log('error', error.message);
            }
        }
    }

    private findDriversRecursive(dir: string): string[] {
        const result: string[] = [];
        if (!this.fileSystem.isDirectory(dir)) return result;

        const items = this.fileSystem.listFiles(dir);
        for (const item of items) {
            // IFileSystem.listFiles returns filenames, we need to join them
            const fullPath = path.join(dir, item);

            if (this.fileSystem.isDirectory(fullPath)) {
                result.push(...this.findDriversRecursive(fullPath));
            } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.js')) {
                result.push(fullPath);
            }
        }
        return result;
    }

    private isDriver(obj: any): obj is Driver {
        return obj && typeof obj.name === 'string' && typeof obj.execute === 'function' && typeof obj.isSupported === 'function';
    }
}

