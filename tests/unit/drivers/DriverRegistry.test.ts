import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { IDriver } from '../../../src/domain/Driver.js';
import { IFileSystem } from '../../../src/domain/IFileSystem.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { DriverRegistry } from '../../../src/drivers/DriverRegistry.js';

describe('DriverRegistry', () => {
  let registry: DriverRegistry;
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockFileSystem: jest.Mocked<IFileSystem>;
  let tempDir: string = '';
  // DriverRegistry is no longer needed as we use the static import

  beforeEach(() => {
    jest.resetModules();
    console.error('TEST STARTING: DriverRegistrySpec');

    mockHost = {
      log: jest.fn((level, msg) => {
        console.error('[MOCK LOG]', level, msg);
      }),
      status: jest.fn(),
      ask: jest.fn(),
      emit: jest.fn(),
    } as unknown as jest.Mocked<IRuntimeHost>;

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'driver-registry-test-'));
    console.error('TEMP DIR CREATED:', tempDir);
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ type: 'module' }));

    // Create a simple Driver file
    const validDriverContent = `
            export class ValidDriver {
                constructor(host, config) { this.name = 'valid-driver'; }
                async execute() {}
                async isSupported() { return true; }
            }
        `;
    fs.writeFileSync(path.join(tempDir, 'ValidDriver.js'), validDriverContent);

    // Subdir driver
    const subdir = path.join(tempDir, 'subdir');
    fs.mkdirSync(subdir);
    const recursiveDriverContent = `
            export class RecursiveDriver {
                constructor(host, config) { this.name = 'recursive-driver'; }
                async execute() {}
                async isSupported() { return true; }
            }
        `;
    fs.writeFileSync(path.join(subdir, 'RecursiveDriver.js'), recursiveDriverContent);

    // Invalid driver
    const invalidDriverContent = `
            export class InvalidDriver {}
        `;
    fs.writeFileSync(path.join(tempDir, 'InvalidDriver.js'), invalidDriverContent);

    mockFileSystem = {
      isDirectory: jest.fn((p: string) => {
        if (!p) {
          console.error('[MOCK FS] isDirectory received falsy!', p);
          return false;
        }
        try {
          return fs.statSync(p).isDirectory();
        } catch (e) {
          console.error('[MOCK FS] isDirectory error for', p, e);
          return false;
        }
      }),
      listFiles: jest.fn((p: string) => {
        try {
          return fs.readdirSync(p);
        } catch {
          return [];
        }
      }),
      exists: jest.fn(),
      readFile: jest.fn(),
      writeFileAtomic: jest.fn(),
      ensureDir: jest.fn(),
      copy: jest.fn(),
      deleteFile: jest.fn(),
      acquireLock: jest.fn(),
      mkdir: jest.fn(),
    } as unknown as jest.Mocked<IFileSystem>;

    const config = { rootDirectory: tempDir, defaultDriver: 'valid-driver' };
    registry = new DriverRegistry(mockHost, config, mockFileSystem);
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_e) {
        // ignore
      }
    }
  });

  describe('register', () => {
    it('should register a driver', () => {
      const driver = { name: 'manual', execute: jest.fn(), isSupported: jest.fn() } as unknown as IDriver;
      registry.register(driver);
      expect(registry.get('manual')).toBe(driver);
    });
  });

  describe('load', () => {
    it('should load flat drivers', async () => {
      console.error('TEST: Calling load with', tempDir);
      await registry.load(tempDir);
      const valid = registry.get('valid-driver');
      expect(valid).toBeDefined();
      expect(valid?.name).toBe('valid-driver');
    });

    it('should load drivers recursively', async () => {
      await registry.load(tempDir);
      expect(registry.get('valid-driver')).toBeDefined();
      expect(registry.get('recursive-driver')).toBeDefined();
    });

    it('should ignore non-driver classes', async () => {
      await registry.load(tempDir);
      expect(registry.getAll().length).toBe(2);
    });

    it('should exit early if path is not a directory', async () => {
      await registry.load(path.join(tempDir, 'ValidDriver.js')); // Point to a file
      expect(registry.get('valid-driver')).toBeUndefined();
    });

    it('should skip .d.ts and .map files', async () => {
      fs.writeFileSync(path.join(tempDir, 'skipped.d.ts'), 'export const foo = 1;');
      fs.writeFileSync(path.join(tempDir, 'skipped.js.map'), '{}');

      await registry.load(tempDir);
      // Should not throw or crash
      expect(registry.getAll().length).toBe(2);
    });

    it('should warn if no valid driver found in file', async () => {
      const emptyFile = path.join(tempDir, 'EmptyDriver.js');
      fs.writeFileSync(emptyFile, 'export class NotADriver {}');

      await registry.load(tempDir);

      expect(mockHost.log.bind(mockHost)).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('No valid driver found'),
      );
    });

    it('should handle import errors gracefully', async () => {
      const badFile = path.join(tempDir, 'BadDriver.js');
      // Use valid syntax that throws runtime error or fails resolution to avoid crashing VM
      fs.writeFileSync(badFile, 'throw new Error("Runtime Import Error");');

      await registry.load(tempDir);

      expect(mockHost.log.bind(mockHost)).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Failed to load driver'),
      );
    });

    it('should log debug if driver is valid but not supported', async () => {
      const unsupportedFile = path.join(tempDir, 'UnsupportedDriver.js');
      const content = `
                export class UnsupportedDriver {
                    constructor(host, config) { this.name = 'unsupported'; }
                    async execute() {}
                    async isSupported() { return false; }
                }
             `;
      fs.writeFileSync(unsupportedFile, content);

      await registry.load(tempDir);

      expect(mockHost.log.bind(mockHost)).toHaveBeenCalledWith('debug', expect.stringContaining('not supported'));
      expect(registry.get('unsupported')).toBeUndefined();
    });

    it('should log critical failure for detailed driver load error', async () => {
      const brokenCritical = path.join(tempDir, 'GeminiDriver.js'); // Simulate a critical driver
      fs.writeFileSync(brokenCritical, 'throw new Error("Critical Load Error");');

      await registry.load(tempDir);

      expect(mockHost.log.bind(mockHost)).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('CRITICAL DRIVER LOAD FAILURE'),
      );
    });

    it('should handle non-function exports', async () => {
      const nonFunctionFile = path.join(tempDir, 'StringExport.js');
      fs.writeFileSync(nonFunctionFile, 'export const foo = "bar";');

      await registry.load(tempDir);
      expect(mockHost.log.bind(mockHost)).not.toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('No valid driver found in ' + nonFunctionFile),
      );
    });

    it('should fallback to gemini as default if not configured', async () => {
      const registryNoConfig = new DriverRegistry(mockHost, {}, mockFileSystem);
      const geminiDriver = {
        name: 'gemini',
        execute: jest.fn(),
        isSupported: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
      } as unknown as IDriver;
      registryNoConfig.register(geminiDriver); // Manually register but name matches fallback

      const geminiFile = path.join(tempDir, 'GeminiDriver.js');
      fs.writeFileSync(
        geminiFile,
        `
                export class GeminiDriver {
                    constructor() { this.name = 'gemini'; }
                    async execute() {}
                    async isSupported() { return true; }
                }
            `,
      );
      await registryNoConfig.load(tempDir);
      expect(registryNoConfig.getDefault()?.name).toBe('gemini');
    });

    it('should handle recursive find with non-dir file', () => {
      // Hit line 91
      const result = (registry as unknown as { findDriversRecursive: (p: string) => unknown[] }).findDriversRecursive(
        path.join(tempDir, 'ValidDriver.js'),
      );
      expect(result).toEqual([]);

      // Also hit line 21 (FileSystemService default)
      const defaultFSRegistry = new DriverRegistry(mockHost, {});
      expect(defaultFSRegistry).toBeDefined();
    });
  });

  describe('getDefault', () => {
    it('should return undefined if no default set', () => {
      const config = { defaultDriver: 'non-existent' };
      const emptyRegistry = new DriverRegistry(mockHost, config, mockFileSystem);
      expect(emptyRegistry.getDefault()).toBeUndefined();
    });

    it('should return default driver if registered', async () => {
      await registry.load(tempDir);
      // Config default is 'valid-driver' in beforeEach
      expect(registry.getDefault()).toBeDefined();
      expect(registry.getDefault()?.name).toBe('valid-driver');
    });
  });
});
