import { jest } from '@jest/globals';

import { IFileSystem } from '../../../src/domain/IFileSystem.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { ISkillConfig, ISkillContext } from '../../../src/domain/SkillConfig.js';
import { ImageGenDriver } from '../../../src/drivers/ImageGenDriver.js';
import { IPromptEngine } from '../../../src/services/PromptEngine.js';

describe('ImageGenDriver', () => {
  let driver: ImageGenDriver;
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockFileSystem: jest.Mocked<IFileSystem>;
  let mockConfig: Record<string, unknown>;
  let mockContext: ISkillContext;
  let mockPromptEngine: jest.Mocked<IPromptEngine>;

  beforeEach(() => {
    mockHost = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      status: jest.fn(),
      ask: jest.fn(),
      emit: jest.fn(),
    } as unknown as jest.Mocked<IRuntimeHost>;
    mockFileSystem = {
      writeFile: jest.fn<IFileSystem['writeFile']>().mockResolvedValue(undefined),
      readFile: jest.fn<IFileSystem['readFile']>().mockResolvedValue(''),
      exists: jest.fn<IFileSystem['exists']>().mockResolvedValue(false),
      isDirectory: jest.fn<IFileSystem['isDirectory']>().mockResolvedValue(false),
      deleteFile: jest.fn<IFileSystem['deleteFile']>().mockResolvedValue(undefined),
      listFiles: jest.fn<IFileSystem['listFiles']>().mockResolvedValue([]),
    } as unknown as jest.Mocked<IFileSystem>;
    mockConfig = {
      rootDirectory: '/test',
    };
    mockPromptEngine = {
      render: jest.fn<IPromptEngine['render']>().mockImplementation((name: string) => name),
      renderString: jest.fn<IPromptEngine['renderString']>().mockImplementation((tmpl: string) => tmpl),
    } as unknown as jest.Mocked<IPromptEngine>;
    mockContext = {
      taskId: 'task-id',
      userPrompt: 'user request',
      promptEngine: mockPromptEngine,
      fileSystem: mockFileSystem,
      params: {},
      workspaceRoot: '/test',
    } as unknown as ISkillContext;

    driver = new ImageGenDriver(mockHost, mockConfig, mockFileSystem);
    // Explicitly mock process.env for isSupported
    process.env.OPENROUTER_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(driver).toBeDefined();
  });

  it('should check for support via environment variable', async () => {
    expect(await driver.isSupported()).toBe(true);
    delete process.env.OPENROUTER_API_KEY;
    expect(await driver.isSupported()).toBe(false);
  });

  it('should validate schema', () => {
    const valid = { name: 'gen', description: 'test', prompt_template: 'test' };
    const res = (driver as unknown as { parseSchema: (s: unknown) => { success: boolean } }).parseSchema(valid);
    expect(res.success).toBe(true);

    const invalid = { name: 'gen', description: 'test' }; // missing prompt_template
    const res2 = (driver as unknown as { parseSchema: (s: unknown) => { success: boolean } }).parseSchema(invalid);
    expect(res2.success).toBe(false);
  });

  it('should handle HTTP image URLs', async () => {
    const mockFetch = jest
      .fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      .mockImplementation((url) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.includes('chat/completions')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                choices: [{ message: { images: [{ image_url: { url: 'http://example.com/image.png' } }] } }],
              }),
          } as Response);
        }
        if (urlStr.includes('image.png')) {
          return Promise.resolve({
            ok: true,
            arrayBuffer: () => Promise.resolve(Buffer.from('image-data').buffer),
          } as Response);
        }
        return Promise.reject(new Error('Unknown url'));
      });
    global.fetch = mockFetch as unknown as typeof fetch;

    const skill = { name: 'gen', description: 'test', prompt_template: 'Draw a cat' };
    await driver.run(skill, { ...mockContext, userPrompt: 'test' });

    expect(mockFileSystem.writeFile).toHaveBeenCalledWith(expect.stringMatching(/image-\d+\.png/), expect.any(Buffer));
  });

  it('should use provided output path', async () => {
    const mockFetch = jest
      .fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      .mockImplementation((url) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.includes('completions')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                choices: [{ message: { images: [{ image_url: { url: 'http://example.com/image.png' } }] } }],
              }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(Buffer.from('image-data').buffer),
        } as Response);
      });
    global.fetch = mockFetch as unknown as typeof fetch;

    const skill = { name: 'gen', description: 'test', prompt_template: 'Draw' };
    const params = { output_path: 'custom.png' };
    await driver.run(skill, { ...mockContext, params });

    expect(mockFileSystem.writeFile).toHaveBeenCalledWith('/test/custom.png', expect.any(Buffer));
  });

  it('should trigger REPLAN if no choices returned', async () => {
    global.fetch = jest.fn<typeof fetch>().mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      } as Response);
    });

    const skill = { name: 'gen', description: 'test', prompt_template: 'Draw a cat' };
    const res = await driver.run(skill, { ...mockContext, userPrompt: 'test' });
    expect(res).toContain('Signal REPLAN triggered');
  });

  it('should trigger REPLAN if missing images property in response', async () => {
    global.fetch = jest.fn<typeof fetch>().mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: {} }] }),
      } as Response);
    });

    const skill = { name: 'gen', description: 'test', prompt_template: 'Draw' };
    const res = await driver.run(skill, { ...mockContext, userPrompt: 'test' });
    expect(res).toContain('Signal REPLAN triggered');
  });

  it('should handle data: image URLs', async () => {
    global.fetch = jest.fn<typeof fetch>().mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,ZGF0YQ==' } }] } }],
          }),
      } as Response);
    });

    const skill = { name: 'gen', description: 'test', prompt_template: 'Draw' };
    await driver.run(skill, mockContext);
    expect(mockFileSystem.writeFile).toHaveBeenCalledWith(expect.any(String), expect.any(Buffer));
  });

  it('should handle raw base64 data fallback', async () => {
    global.fetch = jest.fn<typeof fetch>().mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { images: [{ image_url: { url: 'ZGF0YQ==' } }] } }],
          }),
      } as Response);
    });

    const skill = { name: 'gen', description: 'test', prompt_template: 'Draw' };
    await driver.run(skill, mockContext);
    expect(mockFileSystem.writeFile).toHaveBeenCalledWith(expect.any(String), expect.any(Buffer));
  });

  it('should throw if promptEngine is missing', async () => {
    const skill = { name: 'gen', description: 'test', prompt_template: 'Draw' };
    const contextNoEngine = { ...mockContext, promptEngine: undefined as unknown as IPromptEngine };
    await expect(driver.run(skill, contextNoEngine)).rejects.toThrow('PromptEngine is required');
  });

  it('should use default model and dimensions if not specified', async () => {
    const mockFetch = jest.fn<typeof fetch>().mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,ZGF0YQ==' } }] } }],
          }),
      } as Response);
    });
    global.fetch = mockFetch;

    const skill = { name: 'gen', description: 'test', prompt_template: 'Draw' };
    await driver.run(skill, mockContext);

    const options = mockFetch.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(options.body as string) as {
      model: string;
      image_config: { aspect_ratio: string; image_size: string };
    };
    expect(body.model).toBe('google/gemini-2.0-flash-exp');
    expect(body.image_config.aspect_ratio).toBe('1:1');
    expect(body.image_config.image_size).toBe('1024x1024');
  });

  it('should handle fetch/API errors gracefully by triggering REPLAN', async () => {
    global.fetch = jest.fn<typeof fetch>().mockImplementation(() => {
      return Promise.reject(new Error('Network error'));
    });

    const skill = { name: 'gen', description: 'test', prompt_template: 'Draw' };
    const res = await driver.run(skill, mockContext);
    expect(res).toContain('Signal REPLAN triggered');
    expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Generation attempt 3 failed'));
  });

  it('should trigger REPLAN signal if prompt_template is missing', async () => {
    const invalidSkill = { name: 'gen', description: 'test' }; // missing prompt_template
    const res = await driver.run(invalidSkill as unknown as ISkillConfig, mockContext);

    expect(res).toContain('Signal REPLAN triggered');
    expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/sig_task-id_\d+\.json/),
      expect.stringContaining('"status": "REPLAN"'),
    );
  });

  it('should retry 3 times and then trigger REPLAN signal on failure', async () => {
    const mockFetch = jest.fn<typeof fetch>().mockImplementation(() => {
      return Promise.reject(new Error('Persistent API Error'));
    });
    global.fetch = mockFetch;

    const skill = { name: 'gen', description: 'test', prompt_template: 'Draw' };
    const res = await driver.run(skill, mockContext);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(res).toContain('Signal REPLAN triggered');
    expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/sig_task-id_\d+\.json/),
      expect.stringContaining('"status": "REPLAN"'),
    );
    expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Generation attempt 1 failed'));
    expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Generation attempt 2 failed'));
    expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Generation attempt 3 failed'));
  });

  it('should handle undefined context and missing rootDirectory in systemConfig', async () => {
    global.fetch = jest.fn<typeof fetch>().mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,ZGF0YQ==' } }] } }],
          }),
      } as Response);
    });

    // Create driver with empty systemConfig
    const driverNoRoot = new ImageGenDriver(mockHost, {}, mockFileSystem);
    const skill = { name: 'gen', description: 'test', prompt_template: 'Draw' };

    // Pass minimal context
    const minimalContext = { promptEngine: mockPromptEngine, params: {}, taskId: 'test' } as unknown as ISkillContext;
    await driverNoRoot.run(skill, minimalContext);

    // Verify it used process.cwd() or ran without crashing when rootDirectory is missing
    expect(mockHost.log).toHaveBeenCalledWith('info', expect.stringContaining('Image saved to:'));
  });
});
