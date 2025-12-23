
import { jest } from '@jest/globals';
import { BaseDriver, Skill, DriverConfig } from '../../../src/domain/Driver.js';
import { RuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { IFileSystem } from '../../../src/domain/IFileSystem.js';

// Mock function for execute
const mockExecute = jest.fn<any>();

class TestDriver extends BaseDriver {
    name = 'TestDriver';
    description = 'A test driver';

    constructor(host: RuntimeHost, config?: DriverConfig, fileSystem?: IFileSystem) {
        super(host, config, fileSystem);
        // Manually inject the mock shell
        this.shell = { execute: mockExecute } as any;
    }

    async isSupported(): Promise<boolean> {
        return true;
    }

    async run(skill: Skill, context?: any): Promise<string> {
        if (skill.name === 'fail') throw new Error('Skill failed intentionally');
        return 'success';
    }

    // Expose protected methods for testing
    public async testCheckExecutable(name: string): Promise<boolean> {
        return this.checkExecutable(name);
    }

    public testCheckEnvironment(key: string): boolean {
        return this.checkEnvironment(key);
    }

    public testCheckConfig(key: string): unknown {
        return this.checkConfig(key);
    }

    public getFileSystem(): IFileSystem {
        return this.fileSystem;
    }

    public getConfig(): DriverConfig {
        return this.config;
    }
}

describe('BaseDriver', () => {
    let driver: TestDriver;
    let mockHost: jest.Mocked<RuntimeHost>;
    let mockFileSystem: jest.Mocked<IFileSystem>;

    beforeEach(() => {
        mockHost = {
            log: jest.fn(),
            error: jest.fn()
        } as unknown as jest.Mocked<RuntimeHost>;
        mockFileSystem = {} as unknown as jest.Mocked<IFileSystem>;
        mockExecute.mockReset();

        driver = new TestDriver(mockHost, { rootDirectory: '/', customConfig: 'value' }, mockFileSystem);
    });

    it('should be defined', () => {
        expect(driver).toBeDefined();
    });

    describe('constructor defaults', () => {
        it('should use default config and filesystem if not provided', () => {
            const d = new TestDriver(mockHost);
            expect(d.getConfig().rootDirectory).toBe(process.cwd());
            expect(d.getFileSystem()).toBeDefined();
            // It creates a new FileSystemService, which we can't easily check instance of without importing it, 
            // but checking it is defined is enough for coverage of the branch `|| new FileSystemService(host)`
            // assuming FileSystemService can be instantiated (it deals with fs).
        });
    });

    describe('execute', () => {
        it('should execute successfully', async () => {
            const skill: Skill = { name: 'test' };
            const result = await driver.execute(skill);
            expect(result.isOk()).toBe(true);
            expect(result.unwrap()).toBe('success');
        });

        it('should return failure if run fails', async () => {
            const skill: Skill = { name: 'fail' };
            const result = await driver.execute(skill);
            expect(result.isFail()).toBe(true);
            expect(result.error()?.message).toBe('Skill failed intentionally');
        });

        it('should handle non-Error exceptions', async () => {
            jest.spyOn(driver, 'run').mockRejectedValueOnce('string error');
            const result = await driver.execute({ name: 'test' });
            expect(result.isFail()).toBe(true);
            expect(result.error()?.message).toBe('string error');
        });

        it('should validate skill', async () => {
            const skill: Skill = { name: 'test' }; // Valid schema
            const parsed = await driver.validateSkill(skill);
            expect(parsed).toBe(true);
        });

        it('should fail validation if schema invalid', async () => {
            const skill = {} as Skill; // Invalid, no name
            const parsed = await driver.validateSkill(skill);
            expect(parsed).toBe(false);
            expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Validation failed'));
        });

        it('should not run if validation fails', async () => {
            const skill = {} as Skill;
            const result = await driver.execute(skill);
            expect(result.isFail()).toBe(true);
            expect(result.error()?.message).toContain('Invalid skill');
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

        it('checkConfig should return config value', () => {
            expect(driver.testCheckConfig('rootDirectory')).toBe('/');
            expect(driver.testCheckConfig('customConfig')).toBe('value');
            expect(driver.testCheckConfig('missing')).toBeUndefined();
        });
    });
});
