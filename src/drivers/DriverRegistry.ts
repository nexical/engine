import path from 'path';

import { IDriver } from '../domain/Driver.js';
import { IFileSystem } from '../domain/IFileSystem.js';
import { Registry } from '../domain/Registry.js';
import { IRuntimeHost } from '../domain/RuntimeHost.js';
import { SystemError } from '../errors/SystemError.js';
import { FileSystemService } from '../services/FileSystemService.js';

export interface IDriverRegistry extends Registry<IDriver> {
  register(plugin: IDriver, isDefault?: boolean): void;
  getDefault(): IDriver | undefined;
  load(dir: string): Promise<void>;
}

export class DriverRegistry extends Registry<IDriver> implements IDriverRegistry {
  private defaultPlugin: IDriver | undefined;
  private fileSystem: IFileSystem;

  constructor(
    protected host: IRuntimeHost,
    protected config: Record<string, unknown>,
    fileSystem?: IFileSystem,
  ) {
    super();
    this.fileSystem = fileSystem || new FileSystemService(host);
  }

  register(plugin: IDriver, isDefault: boolean = false): void {
    this.items.set(plugin.name, plugin);
    if (isDefault) {
      this.defaultPlugin = plugin;
    }
  }

  getDefault(): IDriver | undefined {
    return this.defaultPlugin;
  }

  async load(dir: string): Promise<void> {
    if (!(await this.fileSystem.isDirectory(dir))) {
      return;
    }

    const files = await this.findDriversRecursive(dir);

    for (const file of files) {
      if (file.endsWith('.d.ts') || file.endsWith('.map')) {
        continue;
      }

      try {
        const importPath = file.startsWith('/') ? `file://${file}` : file;
        const module = (await import(importPath)) as Record<string, unknown>;
        let loaded = false;
        for (const key in module) {
          const ExportedClass = module[key];
          if (typeof ExportedClass === 'function' && ExportedClass.prototype) {
            try {
              // Create a temporary class that can be instantiated with custom args
              type DriverConstructor = new (
                host: IRuntimeHost,
                config: Record<string, unknown>,
                fs: IFileSystem,
              ) => unknown;
              const Ctor = ExportedClass as DriverConstructor;
              const instance = new Ctor(this.host, this.config, this.fileSystem);

              if (this.isDriver(instance)) {
                if (await instance.isSupported()) {
                  const configuredDefault = (this.config.defaultDriver as string) || 'gemini';
                  const isDefault = instance.name === configuredDefault;
                  this.host.log('debug', `Registering driver: ${instance.name} (Default: ${isDefault})`);
                  this.register(instance, isDefault);
                  loaded = true;
                } else {
                  this.host.log('debug', `Driver '${instance.name}' is not supported by current environment.`);
                }
              }
            } catch {
              // Non-driver class instantiation failure is expected
            }
          }
        }

        if (!loaded && file.match(/Driver\.(ts|js)$/)) {
          this.host.log('warn', `No valid driver found in ${file}`);
        }
      } catch (e) {
        const errorMessage = (e as Error).message;
        const error = SystemError.io(`Failed to load driver from ${file}: ${errorMessage}`, file);
        this.host.log('error', error.message);

        // Track load failures in evolution if it's a critical driver
        if (file.includes('GeminiDriver') || file.includes('ImageGenDriver')) {
          this.host.log('error', `CRITICAL DRIVER LOAD FAILURE: ${file}`);
        }
      }
    }
  }

  private async findDriversRecursive(dir: string): Promise<string[]> {
    const result: string[] = [];
    if (!(await this.fileSystem.isDirectory(dir))) return result;

    const items = await this.fileSystem.listFiles(dir);
    for (const item of items) {
      // IFileSystem.listFiles returns filenames, we need to join them
      const fullPath = path.join(dir, item);

      if (await this.fileSystem.isDirectory(fullPath)) {
        result.push(...(await this.findDriversRecursive(fullPath)));
      } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.js')) {
        result.push(fullPath);
      }
    }
    return result;
  }

  private isDriver(obj: unknown): obj is IDriver {
    const d = obj as IDriver;
    return d && typeof d.name === 'string' && typeof d.execute === 'function' && typeof d.isSupported === 'function';
  }
}
