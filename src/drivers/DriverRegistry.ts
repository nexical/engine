import { Driver } from '../domain/Driver.js';
import { Registry } from '../domain/Registry.js';
import { RuntimeHost } from '../domain/RuntimeHost.js';
import { IFileSystem } from '../domain/IFileSystem.js';
import { FileSystemService } from '../services/FileSystemService.js';
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
        this.fileSystem = fileSystem || new FileSystemService();
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
        if (!this.fileSystem.isDirectory(dir)) return;

        function getFiles(fileSystem: IFileSystem, dir: string): string[] {
            // Note: IFileSystem.listFiles is currently shallow.
            // But DriverRegistry needs recursive?
            // The original code was recursive.
            // IFileSystem.listFiles might not be recursive.
            // Let's implement recursive logic here using IFileSystem or check if listFiles is sufficient.
            // Wait, IFileSystem does NOT have listFilesRecursive.
            // Let's check FileSystemService implementation.
            // FileSystemService.listFiles uses fs.readdirSync(dirPath).map(...) -> shallow.
            // So we need to implement recursion here using IFileSystem methods.

            const result: string[] = [];
            if (!fileSystem.isDirectory(dir)) return result;

            const items = fileSystem.listFiles(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                if (fileSystem.isDirectory(fullPath)) {
                    result.push(...getFiles(fileSystem, fullPath));
                } else {
                    result.push(fullPath);
                }
            }
            return result;
        }

        const files = getFiles(this.fileSystem, dir);

        for (const file of files) {
            // Skip non-code files and definition files
            if ((!file.endsWith('.ts') && !file.endsWith('.js')) || file.endsWith('.d.ts') || file.endsWith('.map')) {
                continue;
            }

            try {
                const module = await import(file);
                let loaded = false;
                for (const key in module) {
                    const ExportedClass = module[key];
                    if (typeof ExportedClass === 'function') {
                        try {
                            // Attempt instantiation
                            // Note: we can't easily check 'implements Driver' at runtime before instantiation 
                            // without checking prototype, but instantiation is safer if constructor is simple.
                            // We assume drivers have a constructor compatible with (host, config)
                            const instance = new ExportedClass(this.host, this.config);
                            if (this.isDriver(instance)) {
                                if (await instance.isSupported()) {
                                    const isDefault = instance.name === 'gemini';
                                    this.host.log('debug', `Registering driver: ${instance.name} (Default: ${isDefault})`);
                                    this.register(instance, isDefault);
                                    loaded = true;
                                } else {
                                    this.host.log('debug', `Driver '${instance.name}' is not supported by current environment.`);
                                }
                            }
                        } catch (e) {
                            // Instantiate failed, likely not a driver class or missing dependencies
                            // We don't log this as error because we might be trying to instantiate helper classes
                        }
                    }
                }

                if (!loaded) {
                    // Verify if we should have loaded something (e.g. if file name ends in Driver.ts)
                    if (file.match(/Driver\.(ts|js)$/)) {
                        this.host.log('warn', `No valid driver found in ${file}`);
                    }
                }

            } catch (e) {
                this.host.log('error', `Failed to load driver from ${file}: ${(e as Error).message}`);
            }
        }
    }

    private isDriver(obj: any): obj is Driver {
        return obj && typeof obj.name === 'string' && typeof obj.execute === 'function' && typeof obj.isSupported === 'function';
    }
}
