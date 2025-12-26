/* eslint-disable */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { jest } from '@jest/globals';

import { Result } from '../../../src/domain/Result.js';
import { ISkillContext } from '../../../src/domain/SkillConfig.js';
import { ImageGenDriver } from '../../../src/drivers/ImageGenDriver.js';

describe('ImageGenDriver', () => {
  let driver: ImageGenDriver;
  let mockHost: any;
  let mockFileSystem: any;
  let mockConfig: any;
  let mockContext: ISkillContext;
  let mockPromptEngine: any;

  beforeEach(() => {
    mockHost = {
      log: jest.fn(),
    };
    mockFileSystem = {
      writeFile: jest.fn(),
    };
    mockConfig = {
      rootDirectory: '/test',
    };
    mockPromptEngine = {
      renderString: jest.fn().mockImplementation((tmpl: any) => tmpl),
    };
    mockContext = {
      taskId: 'task-id',
      userPrompt: 'user request',
      promptEngine: mockPromptEngine,
      fileSystem: mockFileSystem,
      params: {},
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
    const valid = { name: 'gen', prompt_template: 'test' };
    const res = (driver as any).parseSchema(valid);
    expect(res.success).toBe(true);

    const invalid = { name: 'gen' }; // missing prompt_template
    const res2 = (driver as any).parseSchema(invalid);
    expect(res2.success).toBe(false);
  });

  it('should handle HTTP image URLs', async () => {
    global.fetch = jest.fn((url: unknown) => {
      if (typeof url === 'string' && url.includes('chat/completions')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [{ message: { images: [{ image_url: { url: 'http://example.com/image.png' } }] } }],
            }),
        } as unknown as Response);
      }
      if (typeof url === 'string' && url.includes('image.png')) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(Buffer.from('image-data')),
        } as unknown as Response);
      }
      return Promise.reject(new Error('Unknown url'));
    }) as any;

    const skill = { name: 'gen', prompt_template: 'Draw a cat' };
    await driver.run(skill, { ...mockContext, userPrompt: 'test' });

    expect(mockFileSystem.writeFile).toHaveBeenCalledWith(expect.stringMatching(/image-\d+\.png/), expect.anything());
  });

  it('should use provided output path', async () => {
    global.fetch = jest.fn((url: unknown) => {
      if (typeof url === 'string' && url.includes('completions')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [{ message: { images: [{ image_url: { url: 'http://example.com/image.png' } }] } }],
            }),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(Buffer.from('image-data')),
      } as unknown as Response);
    }) as any;

    const skill = { name: 'gen', prompt_template: 'Draw' };
    const params = { output_path: 'custom.png' };
    await driver.run(skill, { ...mockContext, params });

    expect(mockFileSystem.writeFile).toHaveBeenCalledWith('/test/custom.png', expect.anything());
  });

  it('should trigger REPLAN if no choices returned', async () => {
    global.fetch = jest.fn(() => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      } as unknown as Response);
    }) as any;

    const skill = { name: 'gen', prompt_template: 'Draw a cat' };
    const res = await driver.run(skill, { ...mockContext, userPrompt: 'test' });
    expect(res).toContain('Signal REPLAN triggered');
  });

  it('should trigger REPLAN if missing images property in response', async () => {
    global.fetch = jest.fn(() => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: {} }] }),
      } as unknown as Response);
    }) as any;

    const skill = { name: 'gen', prompt_template: 'Draw' };
    const res = await driver.run(skill, { ...mockContext, userPrompt: 'test' });
    expect(res).toContain('Signal REPLAN triggered');
  });

  it('should handle data: image URLs', async () => {
    global.fetch = jest.fn(() => {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,ZGF0YQ==' } }] } }],
          }),
      } as unknown as Response);
    }) as any;

    const skill = { name: 'gen', prompt_template: 'Draw' };
    await driver.run(skill, mockContext);
    expect(mockFileSystem.writeFile).toHaveBeenCalledWith(expect.anything(), Buffer.from('data', 'utf-8'));
  });

  it('should handle raw base64 data fallback', async () => {
    global.fetch = jest.fn(() => {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { images: [{ image_url: { url: 'ZGF0YQ==' } }] } }],
          }),
      } as unknown as Response);
    }) as any;

    const skill = { name: 'gen', prompt_template: 'Draw' };
    await driver.run(skill, mockContext);
    expect(mockFileSystem.writeFile).toHaveBeenCalledWith(expect.anything(), Buffer.from('ZGF0YQ==', 'base64'));
  });

  it('should throw if promptEngine is missing', async () => {
    const skill = { name: 'gen', prompt_template: 'Draw' };
    await expect(driver.run(skill, { ...mockContext, promptEngine: undefined })).rejects.toThrow(
      'PromptEngine is required',
    );
  });

  it('should use default model and dimensions if not specified', async () => {
    global.fetch = jest.fn(() => {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,ZGF0YQ==' } }] } }],
          }),
      } as unknown as Response);
    }) as any;

    const skill = { name: 'gen', prompt_template: 'Draw' };
    await driver.run(skill, mockContext);

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const options = fetchCall[1] as RequestInit;
    const body = JSON.parse(options.body as string);
    expect(body.model).toBe('google/gemini-2.0-flash-exp');
    expect(body.image_config.aspect_ratio).toBe('1:1');
    expect(body.image_config.image_size).toBe('1024x1024');
  });

  it('should handle fetch/API errors gracefully by triggering REPLAN', async () => {
    global.fetch = jest.fn(() => {
      return Promise.reject(new Error('Network error'));
    }) as any;

    const skill = { name: 'gen', prompt_template: 'Draw' };
    const res = await driver.run(skill, mockContext);
    expect(res).toContain('Signal REPLAN triggered');
    expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Generation attempt 3 failed'));
  });

  it('should trigger REPLAN signal if prompt_template is missing', async () => {
    const invalidSkill = { name: 'gen' }; // missing prompt_template
    const res = await driver.run(invalidSkill as any, mockContext);

    expect(res).toContain('Signal REPLAN triggered');
    expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/sig_task-id_\d+\.json/),
      expect.stringContaining('"status": "REPLAN"')
    );
  });

  it('should retry 3 times and then trigger REPLAN signal on failure', async () => {
    global.fetch = jest.fn(() => {
      return Promise.reject(new Error('Persistent API Error'));
    }) as any;

    const skill = { name: 'gen', prompt_template: 'Draw' };
    const res = await driver.run(skill, mockContext);

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(res).toContain('Signal REPLAN triggered');
    expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/sig_task-id_\d+\.json/),
      expect.stringContaining('"status": "REPLAN"')
    );
    expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Generation attempt 1 failed'));
    expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Generation attempt 2 failed'));
    expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Generation attempt 3 failed'));
  });

  it('should handle undefined context and missing rootDirectory in systemConfig', async () => {
    global.fetch = jest.fn(() => {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,ZGF0YQ==' } }] } }],
          }),
      } as unknown as Response);
    }) as any;

    // Create driver with empty systemConfig
    const driverNoRoot = new ImageGenDriver(mockHost, {}, mockFileSystem);
    const skill = { name: 'gen', prompt_template: 'Draw' };

    // Pass empty context
    await driverNoRoot.run(skill, { promptEngine: mockPromptEngine } as any);

    // Verify it used process.cwd() or ran without crashing when rootDirectory is missing
    expect(mockHost.log).toHaveBeenCalledWith('info', expect.stringContaining('Image saved to:'));
  });
});
