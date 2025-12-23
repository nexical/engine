import { jest } from '@jest/globals';

import { ISkill } from '../../../../src/domain/Driver.js';
import { IRuntimeHost } from '../../../../src/domain/RuntimeHost.js';
import { CLIDriver, CLISkill } from '../../../../src/drivers/base/CLIDriver.js';
import { ShellExecutor } from '../../../../src/utils/shell.js';

// Mock shell
jest.mock('../../../../src/utils/shell.js');

class TestCLIDriver extends CLIDriver {
  name = 'test-cli';
  description = 'test';
  protected getExecutable(_skill: ISkill): string {
    return 'cmd';
  }
}

describe('CLIDriver', () => {
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockShell: jest.Mocked<ShellExecutor>;

  beforeEach(() => {
    mockHost = {
      log: jest.fn(),
      status: jest.fn(),
      ask: jest.fn(),
      emit: jest.fn(),
    } as unknown as jest.Mocked<IRuntimeHost>;
  });

  it('should execute shell command', async () => {
    const driver = new TestCLIDriver(mockHost);
    mockShell = (driver as unknown as { shell: jest.Mocked<ShellExecutor> }).shell;
    mockShell.execute = jest
      .fn<() => Promise<{ code: number; stdout: string; stderr: string }>>()
      .mockResolvedValue({ code: 0, stdout: 'ok', stderr: '' });

    const result = await driver.run({ name: 'test', args: ['foo'] } as CLISkill);
    expect(mockShell.execute).toHaveBeenCalledWith('cmd', ['foo'], expect.anything());
    expect(result).toBe('ok');
  });

  it('should throw error on non-zero exit code', async () => {
    const driver = new TestCLIDriver(mockHost);
    mockShell = (driver as unknown as { shell: jest.Mocked<ShellExecutor> }).shell;
    mockShell.execute = jest
      .fn<() => Promise<{ code: number; stdout: string; stderr: string }>>()
      .mockResolvedValue({ code: 1, stdout: '', stderr: 'error msg' });

    await expect(driver.run({ name: 'test', args: ['foo'] } as CLISkill)).rejects.toThrow(
      'Command exited with code 1\nStderr: error msg',
    );
    expect(mockHost.log).toHaveBeenCalledWith('error', 'error msg');
  });

  it('should log and rethrow on execution error', async () => {
    const driver = new TestCLIDriver(mockHost);
    mockShell = (driver as unknown as { shell: jest.Mocked<ShellExecutor> }).shell;
    const error = new Error('execution failed');
    mockShell.execute = jest
      .fn<() => Promise<{ code: number; stdout: string; stderr: string }>>()
      .mockRejectedValue(error);

    await expect(driver.run({ name: 'test', args: ['foo'] } as CLISkill)).rejects.toThrow('execution failed');
    expect(mockHost.log).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('An error occurred while executing the CLI agent: execution failed'),
    );
  });

  it('should not be supported by default', async () => {
    const driver = new TestCLIDriver(mockHost);
    expect(await driver.isSupported()).toBe(false);
  });

  it('should validate schema', () => {
    const driver = new TestCLIDriver(mockHost);
    const result = (driver as unknown as { parseSchema: (s: unknown) => { success: boolean } }).parseSchema({
      name: 'test',
      args: ['foo'],
    });
    expect(result.success).toBe(true);
  });

  it('should handle missing args', async () => {
    const driver = new TestCLIDriver(mockHost);
    mockShell = (driver as unknown as { shell: jest.Mocked<ShellExecutor> }).shell;
    mockShell.execute = jest
      .fn<() => Promise<{ code: number; stdout: string; stderr: string }>>()
      .mockResolvedValue({ code: 0, stdout: 'ok', stderr: '' });

    await driver.run({ name: 'test' } as unknown as CLISkill);
    expect(mockShell.execute).toHaveBeenCalledWith('cmd', [], expect.anything());
  });
});
