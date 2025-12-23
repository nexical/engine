import { jest } from '@jest/globals';

import { RuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { GeminiDriver } from '../../../src/drivers/GeminiDriver.js';
import { ShellExecutor } from '../../../src/utils/shell.js';

// Mock ShellExecutor
jest.mock('../../../src/utils/shell.js');

describe('GeminiDriver', () => {
  let driver: GeminiDriver;
  let mockHost: jest.Mocked<RuntimeHost>;
  let mockShell: jest.Mocked<ShellExecutor>;

  beforeEach(() => {
    mockHost = { log: jest.fn() } as unknown as jest.Mocked<RuntimeHost>;
    driver = new GeminiDriver(mockHost);
    // Access protected shell property via any or test helper
    mockShell = (driver as any).shell;
    // Mock execute method
    mockShell.execute = jest.fn().mockResolvedValue({ code: 0, stdout: 'ok', stderr: '' });
  });

  it('should have correct name', () => {
    expect(driver.name).toBe('gemini');
  });

  it('should check isSupported', async () => {
    mockShell.execute.mockResolvedValue({ code: 0, stdout: '/bin/gemini', stderr: '' });
    const supported = await driver.isSupported();
    expect(supported).toBe(true);
  });

  it('should execute skill', async () => {
    await driver.run({ name: 'test', prompt_template: 'Hello' }, { userPrompt: 'User' });
    expect(mockShell.execute).toHaveBeenCalledWith(
      'gemini',
      expect.arrayContaining(['prompt', 'Hello', '--yolo']),
      expect.anything(),
    );
  });

  it('should include extra arguments if provided in skill', async () => {
    await driver.run({ name: 'test', prompt_template: 'Hello', args: ['--extra', 'val'] } as any, {
      userPrompt: 'User',
    });
    expect(mockShell.execute).toHaveBeenCalledWith(
      'gemini',
      expect.arrayContaining(['--extra', 'val']),
      expect.anything(),
    );
  });
});
