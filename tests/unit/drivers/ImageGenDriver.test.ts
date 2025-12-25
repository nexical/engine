import { jest } from '@jest/globals';
import { BaseDriver, IDriverContext } from '../../../src/domain/Driver.js';
import { ISkillConfig, ISkillContext } from '../../../src/domain/SkillConfig.js';
import { ImageGenDriver } from '../../../src/drivers/ImageGenDriver.js';
import { IPromptEngine } from '../../../src/services/PromptEngine.js';

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
    } as unknown as ISkillContext;

    driver = new ImageGenDriver(mockHost, mockConfig, mockFileSystem);
  });

  it('should be defined', () => {
    expect(driver).toBeDefined();
  });

  it('should handle HTTP image URLs', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        json: jest.fn(() =>
          Promise.resolve({
            choices: [
              {
                message: {
                  images: [
                    {
                      image_url: {
                        url: 'http://example.com/image.png',
                      },
                    },
                  ],
                },
              },
            ],
          }),
        ),
      }),
    ) as any;

    // Mock specific fetch for image download
    (global.fetch as jest.Mock).mockImplementation((url: unknown) => {
      if (typeof url === 'string' && url.includes('chat/completions')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            choices: [{ message: { images: [{ image_url: { url: 'http://example.com/image.png' } }] } }]
          })
        });
      }
      if (typeof url === 'string' && url.includes('image.png')) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(Buffer.from('image-data')),
        });
      }
      return Promise.reject('Unknown url');
    });

    const skill = { name: 'gen', prompt_template: 'Draw a cat' };
    await driver.run(skill, { ...mockContext, userPrompt: 'test' });

    expect(mockFileSystem.writeFile).toHaveBeenCalledWith(expect.stringMatching(/image-\d+\.png/), expect.anything());
  });

  it('should use provided output path', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: unknown) => {
      if (typeof url === 'string' && url.includes('completions')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            choices: [{ message: { images: [{ image_url: { url: 'http://example.com/image.png' } }] } }]
          })
        });
      }
      // second call for image
      return Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(Buffer.from('image-data')),
      });
    });

    const skill = { name: 'gen', prompt_template: 'Draw' };
    const params = { output_path: 'custom.png' };
    await driver.run(skill, { ...mockContext, params });

    expect(mockFileSystem.writeFile).toHaveBeenCalledWith('/test/custom.png', expect.anything());
  });

  it('should throw error if no choices returned', async () => {
    (global.fetch as jest.Mock).mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ choices: [] })
      });
    });

    const skill = { name: 'gen', prompt_template: 'Draw a cat' };
    await expect(driver.run(skill, { ...mockContext, userPrompt: 'test' })).rejects.toThrow(
      'No image data returned from provider',
    );
  });

  it('should handle missing images property in response', async () => {
    (global.fetch as jest.Mock).mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: {} }] })
      });
    });

    const skill = { name: 'gen', prompt_template: 'Draw' };
    await expect(driver.run(skill, { ...mockContext, userPrompt: 'test' })).rejects.toThrow(
      'No image data returned from provider',
    );
  });
});
