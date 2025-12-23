import { jest } from '@jest/globals';

import { ISkill } from '../../../../src/domain/Driver.js';
import { IRuntimeHost } from '../../../../src/domain/RuntimeHost.js';
import { AICLIDriver, AISkill } from '../../../../src/drivers/base/AICLIDriver.js';
import { ShellExecutor } from '../../../../src/utils/shell.js';

// Mock shell
jest.mock('../../../../src/utils/shell.js');

class TestAIDriver extends AICLIDriver {
  name = 'test-ai';
  description = 'test';
  protected getExecutable(_skill: ISkill): string {
    return 'aicmd';
  }
  protected getArguments(_skill: ISkill): string[] {
    return ['arg1'];
  }
}

describe('AICLIDriver', () => {
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

  it('should interpolate args', async () => {
    const driver = new TestAIDriver(mockHost);
    mockShell = (driver as unknown as { shell: jest.Mocked<ShellExecutor> }).shell;
    mockShell.execute = jest
      .fn<() => Promise<{ code: number; stdout: string; stderr: string }>>()
      .mockResolvedValue({ code: 0, stdout: 'ai ok', stderr: '' });

    await driver.run({ name: 'test', prompt_template: 'hi' } as AISkill);
    expect(mockShell.execute).toHaveBeenCalledWith('aicmd', ['arg1'], expect.anything());
  });

  it('should not be supported by default', async () => {
    const driver = new TestAIDriver(mockHost);
    expect(await driver.isSupported()).toBe(false);
  });

  it('should validate schema', () => {
    const driver = new TestAIDriver(mockHost);
    const result = (driver as unknown as { parseSchema: (s: unknown) => { success: boolean } }).parseSchema({
      name: 'test',
      prompt_template: 'foo',
    });
    expect(result.success).toBe(true);
  });

  it('should handle missing prompt template', async () => {
    const driver = new TestAIDriver(mockHost);
    mockShell = (driver as unknown as { shell: jest.Mocked<ShellExecutor> }).shell;
    mockShell.execute = jest
      .fn<() => Promise<{ code: number; stdout: string; stderr: string }>>()
      .mockResolvedValue({ code: 0, stdout: 'ok', stderr: '' });

    await driver.run({ name: 'test' } as unknown as AISkill);
    expect(mockShell.execute).toHaveBeenCalled();
  });
});
