
import { jest } from '@jest/globals';
import { CLIDriver, CLISkill } from '../../../../src/drivers/base/CLIDriver.js';
import { RuntimeHost } from '../../../../src/domain/RuntimeHost.js';
import { ShellExecutor } from '../../../../src/utils/shell.js';

// Mock shell
jest.mock('../../../../src/utils/shell.js');

class TestCLIDriver extends CLIDriver {
    name = 'test-cli';
    description = 'test';
    protected getExecutable(skill: any) { return 'cmd'; }
}

describe('CLIDriver', () => {
    let mockHost: jest.Mocked<RuntimeHost>;
    let mockShell: jest.Mocked<ShellExecutor>;

    beforeEach(() => {
        mockHost = { log: jest.fn(), error: jest.fn() } as unknown as jest.Mocked<RuntimeHost>;
    });

    it('should execute shell command', async () => {
        const driver = new TestCLIDriver(mockHost);
        mockShell = (driver as any).shell;
        mockShell.execute = jest.fn().mockResolvedValue({ code: 0, stdout: 'ok', stderr: '' });

        const result = await driver.run({ name: 'test', args: ['foo'] } as CLISkill);
        expect(mockShell.execute).toHaveBeenCalledWith('cmd', ['foo'], expect.anything());
        expect(result).toBe('ok');
    });

    it('should throw error on non-zero exit code', async () => {
        const driver = new TestCLIDriver(mockHost);
        mockShell = (driver as any).shell;
        mockShell.execute = jest.fn().mockResolvedValue({ code: 1, stdout: '', stderr: 'error msg' });

        await expect(driver.run({ name: 'test', args: ['foo'] } as CLISkill))
            .rejects.toThrow('Command exited with code 1\nStderr: error msg');
        expect(mockHost.log).toHaveBeenCalledWith('error', 'error msg');
    });

    it('should log and rethrow on execution error', async () => {
        const driver = new TestCLIDriver(mockHost);
        mockShell = (driver as any).shell;
        const error = new Error('execution failed');
        mockShell.execute = jest.fn().mockRejectedValue(error);

        await expect(driver.run({ name: 'test', args: ['foo'] } as CLISkill))
            .rejects.toThrow('execution failed');
        expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('An error occurred while executing the CLI agent: execution failed'));
    });

    it('should not be supported by default', async () => {
        const driver = new TestCLIDriver(mockHost);
        expect(await driver.isSupported()).toBe(false);
    });

    it('should validate schema', () => {
        const driver = new TestCLIDriver(mockHost);
        const result = (driver as any).parseSchema({ name: 'test', args: ['foo'] });
        expect(result.success).toBe(true);
    });

    it('should handle missing args', async () => {
        const driver = new TestCLIDriver(mockHost);
        mockShell = (driver as any).shell;
        mockShell.execute = jest.fn().mockResolvedValue({ code: 0, stdout: 'ok', stderr: '' });

        await driver.run({ name: 'test' } as any);
        expect(mockShell.execute).toHaveBeenCalledWith('cmd', [], expect.anything());
    });
});
