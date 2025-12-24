import { jest } from '@jest/globals';

import { IDriverContext, ISkill } from '../../../../src/domain/Driver.js';
import { IRuntimeHost } from '../../../../src/domain/RuntimeHost.js';
import { CLIDriver, CLISkill } from '../../../../src/drivers/base/CLIDriver.js';
import { ShellService } from '../../../../src/services/ShellService.js';

// Mock shell
jest.mock('../../../../src/services/ShellService.js');

class TestCLIDriver extends CLIDriver {
  name = 'test-cli';
  description = 'test';
  protected getExecutable(_skill: ISkill): string {
    return 'cmd';
  }
}

describe('CLIDriver', () => {
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockShell: jest.Mocked<ShellService>;

  beforeEach(() => {
    mockHost = {
      log: jest.fn(),
      status: jest.fn(),
      ask: jest.fn(),
      emit: jest.fn(),
    } as unknown as jest.Mocked<IRuntimeHost>;
  });

  it('should execute shell command', async () => {
    const mockContext = {
      promptEngine: { renderString: jest.fn().mockReturnValue('foo') },
    } as unknown as IDriverContext;

    const driver = new TestCLIDriver(mockHost);
    mockShell = (driver as unknown as { shell: jest.Mocked<ShellService> }).shell;
    mockShell.execute = jest
      .fn<() => Promise<{ code: number; stdout: string; stderr: string }>>()
      .mockResolvedValue({ code: 0, stdout: 'ok', stderr: '' });

    const result = await driver.run({ name: 'test', args: ['foo'] } as CLISkill, mockContext);
    expect(mockShell.execute).toHaveBeenCalledWith('cmd', ['foo'], expect.anything());
    expect(result).toBe('ok');
  });

  it('should throw error on non-zero exit code', async () => {
    const driver = new TestCLIDriver(mockHost);
    mockShell = (driver as unknown as { shell: jest.Mocked<ShellService> }).shell;
    mockShell.execute = jest
      .fn<() => Promise<{ code: number; stdout: string; stderr: string }>>()
      .mockResolvedValue({ code: 1, stdout: '', stderr: 'error msg' });

    const mockContext = {
      promptEngine: { renderString: jest.fn().mockReturnValue('foo') },
    } as unknown as IDriverContext;
    await expect(driver.run({ name: 'test', args: ['foo'] } as CLISkill, mockContext)).rejects.toThrow(
      'Command exited with code 1 \nStderr: error msg ',
    );
    expect(mockHost.log).toHaveBeenCalledWith('error', 'error msg');
  });

  it('should log and rethrow on execution error', async () => {
    const driver = new TestCLIDriver(mockHost);
    mockShell = (driver as unknown as { shell: jest.Mocked<ShellService> }).shell;
    const error = new Error('execution failed');
    mockShell.execute = jest
      .fn<() => Promise<{ code: number; stdout: string; stderr: string }>>()
      .mockRejectedValue(error);

    const mockContext = {
      promptEngine: { renderString: jest.fn().mockReturnValue('foo') },
    } as unknown as IDriverContext;
    await expect(driver.run({ name: 'test', args: ['foo'] } as CLISkill, mockContext)).rejects.toThrow(
      'execution failed',
    );
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
    const mockContext = {
      promptEngine: { renderString: jest.fn().mockReturnValue('foo') },
    } as unknown as IDriverContext;

    const driver = new TestCLIDriver(mockHost);
    mockShell = (driver as unknown as { shell: jest.Mocked<ShellService> }).shell;
    mockShell.execute = jest
      .fn<() => Promise<{ code: number; stdout: string; stderr: string }>>()
      .mockResolvedValue({ code: 0, stdout: 'ok', stderr: '' });

    await driver.run({ name: 'test' } as CLISkill, mockContext);
    expect(mockShell.execute).toHaveBeenCalledWith('cmd', [], expect.anything());
  });

  it('should throw error if promptEngine is missing', async () => {
    const driver = new TestCLIDriver(mockHost);
    const contextWithoutEngine = {} as unknown as IDriverContext;
    await expect(driver.run({ name: 'test' } as CLISkill, contextWithoutEngine)).rejects.toThrow(
      'PromptEngine is required for CLIDriver execution',
    );
  });
});
