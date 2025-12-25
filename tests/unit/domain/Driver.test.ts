import { jest } from '@jest/globals';

import { BaseDriver } from '../../../src/domain/Driver.js';
import { IFileSystem } from '../../../src/domain/IFileSystem.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { DriverConfig } from '../../../src/domain/SkillConfig.js';

// Mock function for execute
const mockExecute = jest.fn<(command: string, args?: string[]) => Promise<string>>();

class TestDriver extends BaseDriver {
  name = 'TestDriver';
  description = 'A test driver';

  constructor(host: IRuntimeHost, systemConfig?: Record<string, unknown>, fileSystem?: IFileSystem) {
    super(host, systemConfig, fileSystem);
    // Manually inject the mock shell
    (this as unknown as { shell: { execute: typeof mockExecute } }).shell = { execute: mockExecute };
  }

  async isSupported(): Promise<boolean> {
    return Promise.resolve(true);
  }

  async run(config: DriverConfig, _context?: unknown): Promise<string> {
    if (config.provider === 'fail') return Promise.reject(new Error('Skill execution failed intentionally'));
    return Promise.resolve('success');
  }

  // Expose protected methods for testing
  public async testCheckExecutable(name: string): Promise<boolean> {
    return this.checkExecutable(name);
  }

  public testCheckEnvironment(key: string): boolean {
    return this.checkEnvironment(key);
  }

  public getFileSystem(): IFileSystem {
    return this.fileSystem;
  }
}

describe('BaseDriver', () => {
  let driver: TestDriver;
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockFileSystem: jest.Mocked<IFileSystem>;

  beforeEach(() => {
    mockHost = {
      log: jest.fn(),
      status: jest.fn(),
      ask: jest.fn(),
      emit: jest.fn(),
    } as unknown as jest.Mocked<IRuntimeHost>;
    mockFileSystem = {} as unknown as jest.Mocked<IFileSystem>;
    mockExecute.mockReset();

    driver = new TestDriver(mockHost, { rootDirectory: '/', customConfig: 'value' }, mockFileSystem);
  });

  it('should be defined', () => {
    expect(driver).toBeDefined();
  });

  describe('constructor defaults', () => {
    it('should use default filesystem if not provided', () => {
      const d = new TestDriver(mockHost);
      expect(d.getFileSystem()).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should execute successfully', async () => {
      const config: DriverConfig = { provider: 'test' };
      const result = await driver.execute(config);
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe('success');
    });

    it('should return failure if run fails', async () => {
      const config: DriverConfig = { provider: 'fail' };
      const result = await driver.execute(config);
      expect(result.isFail()).toBe(true);
      expect(result.error()?.message).toBe('Skill execution failed intentionally');
    });

    it('should handle non-Error exceptions', async () => {
      jest.spyOn(driver, 'run').mockRejectedValueOnce('string error');
      const result = await driver.execute({ provider: 'test' });
      expect(result.isFail()).toBe(true);
      expect(result.error()?.message).toBe('string error');
    });

    it('should validate config', async () => {
      const config: DriverConfig = { provider: 'test' };
      const parsed = await driver.validateConfig(config);
      expect(parsed).toBe(true);
    });

    it('should not run if validation fails (extended driver implementation)', async () => {
      jest.spyOn(driver, 'validateConfig').mockResolvedValueOnce(false);
      const config: DriverConfig = { provider: 'test' };
      const result = await driver.execute(config);
      expect(result.isFail()).toBe(true);
      expect(result.error()?.message).toContain('Invalid config');
    });
  });

  describe('helper methods', () => {
    it('checkExecutable should return true if command exists', async () => {
      mockExecute.mockResolvedValue('path/to/cmd');
      const result = await driver.testCheckExecutable('cmd');
      expect(result).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith('which', ['cmd']);
    });

    it('checkExecutable should return false if command fails', async () => {
      mockExecute.mockRejectedValue(new Error('not found'));
      const result = await driver.testCheckExecutable('unknown');
      expect(result).toBe(false);
    });

    it('checkEnvironment should return true if env var exists', () => {
      process.env.TEST_VAR = 'exists';
      expect(driver.testCheckEnvironment('TEST_VAR')).toBe(true);
      delete process.env.TEST_VAR;
    });

    it('checkEnvironment should return false if env var missing', () => {
      delete process.env.MISSING_VAR;
      expect(driver.testCheckEnvironment('MISSING_VAR')).toBe(false);
    });
  });
});
