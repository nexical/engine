import { jest } from '@jest/globals';

import { IDriverContext, ISkill } from '../../../src/domain/Driver.js';
import { IFileSystem } from '../../../src/domain/IFileSystem.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { ImageGenDriver } from '../../../src/drivers/ImageGenDriver.js';
import { IPromptEngine } from '../../../src/services/PromptEngine.js';

// Mock fetch
const mockFetch = jest.fn<() => Promise<Response>>();
(global as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;

describe('ImageGenDriver', () => {
  let driver: ImageGenDriver;
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockFileSystem: jest.Mocked<IFileSystem>;

  beforeEach(() => {
    mockHost = {
      log: jest.fn(),
      status: jest.fn(),
      ask: jest.fn(),
      emit: jest.fn(),
    } as unknown as jest.Mocked<IRuntimeHost>;
    mockFileSystem = {
      writeFile: jest.fn(),
      exists: jest.fn(),
      readFile: jest.fn(),
      writeFileAtomic: jest.fn(),
      ensureDir: jest.fn(),
      copy: jest.fn(),
      deleteFile: jest.fn(),
      acquireLock: jest.fn(),
      mkdir: jest.fn(),
      isDirectory: jest.fn(),
      listFiles: jest.fn(),
    } as unknown as jest.Mocked<IFileSystem>;

    // Set env variable
    process.env.OPENROUTER_API_KEY = 'test-key';

    driver = new ImageGenDriver(mockHost, { rootDirectory: '/test' }, mockFileSystem);
  });

  const mockContext = {
    taskId: '1',
    userPrompt: 'test',
    promptEngine: { renderString: jest.fn().mockReturnValue('rendered prompt') },
  } as unknown as IDriverContext;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be supported if key exists', async () => {
    expect(await driver.isSupported()).toBe(true);
  });

  it('should generate image', async () => {
    // Mock API response
    mockFetch.mockResolvedValueOnce({
      json: async () =>
        Promise.resolve({
          choices: [
            {
              message: {
                images: [{ image_url: { url: 'data:image/png;base64,DATA' } }],
              },
            },
          ],
        }),
    } as Response);

    const skill = { name: 'gen', prompt_template: 'Draw a cat' };
    await driver.run(skill, { ...mockContext, userPrompt: 'cat' });

    expect(mockFetch).toHaveBeenCalledWith('https://openrouter.ai/api/v1/chat/completions', expect.anything());
    expect(mockFileSystem.writeFile).toHaveBeenCalled();
  });

  it('should handle HTTP image URLs', async () => {
    // Mock API response
    mockFetch.mockImplementation(async (url: string | URL | Request) => {
      let urlStr: string;
      if (typeof url === 'string') {
        urlStr = url;
      } else if (url instanceof URL) {
        urlStr = url.toString();
      } else {
        urlStr = url.url;
      }
      if (urlStr.includes('openrouter')) {
        return Promise.resolve({
          json: async () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    images: [{ image_url: { url: 'https://example.com/image.png' } }],
                  },
                },
              ],
            }),
        } as Response);
      }
      if (urlStr === 'https://example.com/image.png') {
        return Promise.resolve({
          arrayBuffer: async () => Promise.resolve(Buffer.from('image-data')),
        } as Response);
      }
      return Promise.resolve({} as Response);
    });

    const skill = { name: 'gen', prompt_template: 'Draw a cat' };
    await driver.run(skill, { ...mockContext, userPrompt: 'test' });

    expect(mockFileSystem.writeFile).toHaveBeenCalledWith(expect.stringMatching(/image - \d+\.png/), expect.anything());
  });

  it('should use provided output path', async () => {
    mockFetch.mockResolvedValue({
      json: async () =>
        Promise.resolve({
          choices: [
            {
              message: {
                images: [{ image_url: { url: 'data:image/png;base64,DATA' } }],
              },
            },
          ],
        }),
    } as Response);

    const skill = { name: 'gen', prompt_template: 'Draw a cat' };
    await driver.run(skill, { ...mockContext, userPrompt: 'test', params: { output_path: 'custom.png' } });

    expect(mockFileSystem.writeFile).toHaveBeenCalledWith('/test/custom.png', expect.anything());
  });

  it('should throw error if no choices returned', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => Promise.resolve({ choices: [] }),
    } as Response);

    const skill = { name: 'gen', prompt_template: 'Draw a cat' };
    await expect(driver.run(skill, { ...mockContext, userPrompt: 'test' })).rejects.toThrow(
      'No image data returned from provider',
    );
  });

  it('should throw error if fetch fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('API Down'));
    const skill = { name: 'gen', prompt_template: 'Draw a cat' };

    jest.spyOn(mockHost, 'log');

    await expect(driver.run(skill, { ...mockContext, userPrompt: 'test' })).rejects.toThrow('API Down');
    expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Image generation failed: API Down'));
  });

  it('should use custom aspect ratio and resolution from params', async () => {
    mockFetch.mockResolvedValue({
      json: async () =>
        Promise.resolve({
          choices: [
            {
              message: {
                images: [{ image_url: { url: 'data:image/png;base64,DATA' } }],
              },
            },
          ],
        }),
    } as Response);

    const skill = { name: 'gen', prompt_template: 'Draw' };
    await driver.run(skill, {
      ...mockContext,
      userPrompt: 'test',
      params: { aspectRatio: '16:9', resolution: '2K' },
    });

    const calls = mockFetch.mock.calls as [string, { body: string }][];
    const body = JSON.parse(calls[0][1].body) as { image_config: { aspect_ratio: string; image_size: string } };
    expect(body.image_config.aspect_ratio).toBe('16:9');
    expect(body.image_config.image_size).toBe('2K');
  });

  it('should handle raw image data without prefix', async () => {
    mockFetch.mockResolvedValue({
      json: async () =>
        Promise.resolve({
          choices: [
            {
              message: {
                images: [{ image_url: { url: 'RAW_DATA' } }],
              },
            },
          ],
        }),
    } as Response);

    const skill = { name: 'gen', prompt_template: 'Draw' };
    await driver.run(skill, { ...mockContext, userPrompt: 'test' });
    expect(mockFileSystem.writeFile).toHaveBeenCalledWith(expect.anything(), Buffer.from('RAW_DATA', 'base64'));
  });

  it('should validate skill schema', () => {
    const skill = {
      name: 'gen',
      prompt_template: 'Draw',
      model: 'test-model',
      aspect_ratio: '4:3',
      resolution: 'HD',
    };
    const result = (
      driver as unknown as { parseSchema: (skill: ISkill) => { success: boolean; data: { model: string } } }
    ).parseSchema(skill);
    expect(result.success).toBe(true);
    expect(result.data.model).toBe('test-model');
  });

  it('should handle empty user prompt', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () =>
        Promise.resolve({
          choices: [
            {
              message: {
                images: [{ image_url: { url: 'data:image/png;base64,DATA' } }],
              },
            },
          ],
        }),
    } as Response);

    const skill = { name: 'gen', prompt_template: 'Draw' };
    await driver.run(skill, { ...mockContext, userPrompt: '' });
    expect(mockFetch).toHaveBeenCalled();
  });

  it('should handle missing images property in response', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () =>
        Promise.resolve({
          choices: [
            {
              message: { text: 'No images here' },
            },
          ],
        }),
    } as Response);

    const skill = { name: 'gen', prompt_template: 'Draw' };
    await expect(driver.run(skill, { ...mockContext, userPrompt: 'test' })).rejects.toThrow(
      'No image data returned from provider',
    );
  });

  it('should throw error if promptEngine is missing', async () => {
    const skill = { name: 'gen', prompt_template: 'Draw a cat' };
    const contextWithoutEngine = { ...mockContext, promptEngine: undefined } as unknown as IDriverContext;
    await expect(driver.run(skill, contextWithoutEngine)).rejects.toThrow(
      'PromptEngine is required for ImageGenDriver execution',
    );
  });

  it('should handle missing taskId and userPrompt in context', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () =>
        Promise.resolve({
          choices: [
            {
              message: {
                images: [{ image_url: { url: 'data:image/png;base64,DATA' } }],
              },
            },
          ],
        }),
    } as Response);

    const skill = { name: 'gen', prompt_template: 'Draw {user_request}' };
    // context without userPrompt and taskId
    const sparseContext = {
      promptEngine: {
        renderString: jest
          .fn<IPromptEngine['renderString']>()
          .mockImplementation((t: string, args: Record<string, unknown>) => {
            const userRequest = (args.user_request as string) || '';
            return t.replace('{user_request}', userRequest);
          }),
      },
    } as unknown as IDriverContext;

    await driver.run(skill, sparseContext);

    const promptEngine = sparseContext.promptEngine as unknown as jest.Mocked<IPromptEngine>;
    expect(promptEngine.renderString).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        user_request: '',
        task_id: '',
      }),
    );
  });
});
