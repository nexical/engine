
import { jest } from '@jest/globals';
import { ImageGenDriver } from '../../../src/drivers/ImageGenDriver.js';
import { RuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { IFileSystem } from '../../../src/domain/IFileSystem.js';

// Mock fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe('ImageGenDriver', () => {
    let driver: ImageGenDriver;
    let mockHost: jest.Mocked<RuntimeHost>;
    let mockFileSystem: jest.Mocked<IFileSystem>;

    beforeEach(() => {
        mockHost = { log: jest.fn() } as unknown as jest.Mocked<RuntimeHost>;
        mockFileSystem = {
            writeFile: jest.fn()
        } as unknown as jest.Mocked<IFileSystem>;

        // Set env variable
        process.env.OPENROUTER_API_KEY = 'test-key';

        driver = new ImageGenDriver(mockHost, { rootDirectory: '/test' }, mockFileSystem);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should be supported if key exists', async () => {
        expect(await driver.isSupported()).toBe(true);
    });

    it('should generate image', async () => {
        // Mock API response
        mockFetch.mockResolvedValueOnce({
            json: async () => ({
                choices: [{
                    message: {
                        images: [{ image_url: { url: 'data:image/png;base64,DATA' } }]
                    }
                }]
            })
        });

        const skill = { name: 'gen', prompt_template: 'Draw a cat' };
        await driver.run(skill, { userPrompt: 'cat' });

        expect(mockFetch).toHaveBeenCalledWith('https://openrouter.ai/api/v1/chat/completions', expect.anything());
        expect(mockFileSystem.writeFile).toHaveBeenCalled();
    });

    it('should handle HTTP image URLs', async () => {
        // Mock API response
        mockFetch.mockImplementation(async (url: string | URL | Request) => {
            const urlStr = url.toString();
            if (urlStr.includes('openrouter')) {
                return {
                    json: async () => ({
                        choices: [{
                            message: {
                                images: [{ image_url: { url: 'https://example.com/image.png' } }]
                            }
                        }]
                    })
                };
            }
            if (urlStr === 'https://example.com/image.png') {
                return {
                    arrayBuffer: async () => Buffer.from('image-data'),
                };
            }
            return {};
        });

        const skill = { name: 'gen', prompt_template: 'Draw a cat' };
        await driver.run(skill, { userPrompt: 'test' });

        expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
            expect.stringMatching(/image-\d+\.png/),
            expect.anything()
        );
    });

    it('should use provided output path', async () => {
        mockFetch.mockResolvedValue({
            json: async () => ({
                choices: [{
                    message: {
                        images: [{ image_url: { url: 'data:image/png;base64,DATA' } }]
                    }
                }]
            })
        });

        const skill = { name: 'gen', prompt_template: 'Draw a cat' };
        await driver.run(skill, { userPrompt: 'test', params: { output_path: 'custom.png' } });

        expect(mockFileSystem.writeFile).toHaveBeenCalledWith('/test/custom.png', expect.anything());
    });

    it('should throw error if no choices returned', async () => {
        mockFetch.mockResolvedValueOnce({
            json: async () => ({ choices: [] })
        });

        const skill = { name: 'gen', prompt_template: 'Draw a cat' };
        await expect(driver.run(skill, { userPrompt: 'test' })).rejects.toThrow('No image data returned from provider');
    });

    it('should throw error if fetch fails', async () => {
        mockFetch.mockRejectedValueOnce(new Error('API Down'));
        const skill = { name: 'gen', prompt_template: 'Draw a cat' };

        const consoleSpy = jest.spyOn(mockHost, 'log');

        await expect(driver.run(skill, { userPrompt: 'test' })).rejects.toThrow('API Down');
        expect(consoleSpy).toHaveBeenCalledWith('error', expect.stringContaining('Image generation failed: API Down'));
    });

    it('should use custom aspect ratio and resolution from params', async () => {
        mockFetch.mockResolvedValue({
            json: async () => ({
                choices: [{
                    message: {
                        images: [{ image_url: { url: 'data:image/png;base64,DATA' } }]
                    }
                }]
            })
        });

        const skill = { name: 'gen', prompt_template: 'Draw' };
        await driver.run(skill, {
            userPrompt: 'test',
            params: { aspectRatio: '16:9', resolution: '2K' }
        });

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.image_config.aspect_ratio).toBe('16:9');
        expect(body.image_config.image_size).toBe('2K');
    });

    it('should handle raw image data without prefix', async () => {
        mockFetch.mockResolvedValue({
            json: async () => ({
                choices: [{
                    message: {
                        images: [{ image_url: { url: 'RAW_DATA' } }]
                    }
                }]
            })
        });

        const skill = { name: 'gen', prompt_template: 'Draw' };
        await driver.run(skill, { userPrompt: 'test' });
        expect(mockFileSystem.writeFile).toHaveBeenCalledWith(expect.anything(), Buffer.from('RAW_DATA', 'base64'));
    });

    it('should validate skill schema', () => {
        const skill = {
            name: 'gen',
            prompt_template: 'Draw',
            model: 'test-model',
            aspect_ratio: '4:3',
            resolution: 'HD'
        };
        const result = (driver as any).parseSchema(skill);
        expect(result.success).toBe(true);
        expect(result.data.model).toBe('test-model');
    });

    it('should handle empty user prompt', async () => {
        mockFetch.mockResolvedValueOnce({
            json: async () => ({
                choices: [{
                    message: {
                        images: [{ image_url: { url: 'data:image/png;base64,DATA' } }]
                    }
                }]
            })
        });

        const skill = { name: 'gen', prompt_template: 'Draw' };
        await driver.run(skill, { userPrompt: '' });
        expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle missing images property in response', async () => {
        mockFetch.mockResolvedValueOnce({
            json: async () => ({
                choices: [{
                    message: { text: 'No images here' }
                }]
            })
        });

        const skill = { name: 'gen', prompt_template: 'Draw' };
        await expect(driver.run(skill, { userPrompt: 'test' })).rejects.toThrow('No image data returned from provider');
    });
});
