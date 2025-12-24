import { jest } from '@jest/globals';

import { IDriverContext, ISkill } from '../../../src/domain/Driver.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { AISkill } from '../../../src/drivers/base/AICLIDriver.js';
import { GeminiDriver } from '../../../src/drivers/GeminiDriver.js';
import { ShellService } from '../../../src/services/ShellService.js';

// Mock ShellService
jest.mock('../../../src/services/ShellService.js');

describe('GeminiDriver', () => {
  let driver: GeminiDriver;
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockShell: jest.Mocked<ShellService>;

  beforeEach(() => {
    mockHost = {
      log: jest.fn(),
      status: jest.fn(),
      ask: jest.fn(),
      emit: jest.fn(),
    } as unknown as jest.Mocked<IRuntimeHost>;
    driver = new GeminiDriver(mockHost);
    // Access protected shell property via unknown cast
    mockShell = (driver as unknown as { shell: jest.Mocked<ShellService> }).shell;
    // Mock execute method
    mockShell.execute = jest
      .fn<() => Promise<{ code: number; stdout: string; stderr: string }>>()
      .mockResolvedValue({ code: 0, stdout: 'ok', stderr: '' });
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
    const context = {
      promptEngine: {
        renderString: jest.fn().mockImplementation((t) => t),
      },
    } as unknown as IDriverContext;
    await driver.run({ name: 'test', prompt_template: 'Hello' }, context);
    expect(mockShell.execute).toHaveBeenCalledWith(
      'gemini',
      expect.arrayContaining(['prompt', 'Hello', '--yolo']),
      expect.anything(),
    );
  });

  it('should execute gemini model', async () => {
    const context = {
      promptEngine: {
        renderString: jest.fn().mockImplementation((t: string, c: Record<string, unknown>) => {
          if (t === '{prompt}') return (c.prompt as string) || t;
          return t;
        }),
      },
    } as unknown as IDriverContext;

    // Mock the shell execute to return a specific response for this test
    mockShell.execute.mockResolvedValueOnce({ code: 0, stdout: 'response', stderr: '' });

    const result = await driver.run(
      {
        name: 'test',
        prompt_template: 'template',
        model: 'gemini-pro',
      } as AISkill,
      context,
    );

    expect(result).toBe('response');
    expect(mockShell.execute).toHaveBeenCalledWith(
      'gemini',
      expect.arrayContaining(['prompt', 'template', '--yolo']),
      expect.anything(),
    );
  });

  it('should include extra arguments if provided in skill', async () => {
    await driver.run(
      { name: 'test', prompt_template: 'Hello', args: ['--extra', 'val'] } as unknown as ISkill,
      {
        userPrompt: 'User',
        promptEngine: {
          renderString: jest.fn().mockImplementation((t: string, c: Record<string, unknown>) => {
            if (t === '{prompt}') return (c.prompt as string) || t;
            return t;
          }),
        },
      } as unknown as IDriverContext,
    );
    expect(mockShell.execute).toHaveBeenCalledWith(
      'gemini',
      expect.arrayContaining(['--extra', 'val']),
      expect.anything(),
    );
  });
});
