import { jest } from '@jest/globals';

import { IDriverContext, ISkill } from '../../../src/domain/Driver.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { GeminiDriver } from '../../../src/drivers/GeminiDriver.js';
import { IPromptEngine } from '../../../src/services/PromptEngine.js';
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
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<IRuntimeHost>;
    driver = new GeminiDriver(mockHost, {
      rootDirectory: '/tmp',
    });
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

  it('should return false if gemini --version fails', async () => {
    mockShell.execute.mockImplementation((_cmd: string, args: string[]) => {
      if (args.includes('--version')) {
        return Promise.reject(new Error('version failed'));
      }
      return Promise.resolve({ code: 0, stdout: '/bin/gemini', stderr: '' });
    });
    const supported = await driver.isSupported();
    expect(supported).toBe(false);
  });

  it('should return false if gemini binary is missing', async () => {
    mockShell.execute.mockImplementation((cmd: string) => {
      if (cmd === 'which') {
        return Promise.reject(new Error('not found'));
      }
      return Promise.resolve({ code: 0, stdout: '', stderr: '' });
    });
    const supported = await driver.isSupported();
    expect(supported).toBe(false);
  });

  it('should execute skill', async () => {
    const context = {
      promptEngine: {
        renderString: jest
          .fn<IPromptEngine['renderString']>()
          .mockImplementation((tmpl: string, ctx: Record<string, unknown>) => {
            if (tmpl === '{prompt}') return (ctx.prompt as string) || '';
            return tmpl;
          }),
      },
    } as unknown as IDriverContext;
    await driver.run({ name: 'test', description: 'test', prompt_template: 'Hello' } as ISkill, context);
    expect(mockShell.execute).toHaveBeenCalledWith(
      'gemini',
      expect.arrayContaining(['prompt', 'Hello\n', '--yolo']),
      expect.any(Object),
    );
  });

  it('should execute gemini model', async () => {
    const context = {
      promptEngine: {
        renderString: jest
          .fn<IPromptEngine['renderString']>()
          .mockImplementation((t: string, c: Record<string, unknown>) => {
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
        description: 'test',
        prompt_template: 'template',
        model: 'gemini-pro',
      } as unknown as ISkill,
      context,
    );

    expect(result).toBe('response');
    expect(mockShell.execute).toHaveBeenCalledWith('gemini', expect.any(Array), expect.any(Object));
  });

  it('should include extra arguments if provided in skill', async () => {
    await driver.run(
      { name: 'test', description: 'test', prompt_template: 'Hello', args: ['--extra', 'val'] } as unknown as ISkill,
      {
        userPrompt: 'User',
        promptEngine: {
          renderString: jest
            .fn<IPromptEngine['renderString']>()
            .mockImplementation((t: string, c: Record<string, unknown>) => {
              if (t === '{prompt}') return (c.prompt as string) || t;
              return t;
            }),
        },
      } as unknown as IDriverContext,
    );
    expect(mockShell.execute).toHaveBeenCalledWith(
      'gemini',
      expect.arrayContaining(['--extra', 'val']),
      expect.any(Object),
    );
  });

  it('should handle skill without extra arguments', async () => {
    await driver.run(
      { name: 'test', description: 'test', prompt_template: 'Hello' } as unknown as ISkill,
      {
        userPrompt: 'User',
        promptEngine: {
          renderString: jest.fn<IPromptEngine['renderString']>().mockReturnValue('Hello'),
        },
      } as unknown as IDriverContext,
    );
    expect(mockShell.execute).toHaveBeenCalledWith(
      'gemini',
      expect.not.arrayContaining(['--extra']),
      expect.any(Object),
    );
  });
});
