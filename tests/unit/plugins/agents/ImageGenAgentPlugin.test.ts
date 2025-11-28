import { jest, expect, describe, it, beforeEach, afterEach } from '@jest/globals';
import type { ImageGenAgentPlugin as ImageGenAgentPluginType } from '../../../../src/plugins/agents/ImageGenAgentPlugin.js';
import type { Agent } from '../../../../src/models/Agent.js';

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

const { ImageGenAgentPlugin } = await import('../../../../src/plugins/agents/ImageGenAgentPlugin.js');

describe('ImageGenAgentPlugin', () => {
    let imageGenPlugin: ImageGenAgentPluginType;
    let mockOrchestrator: any;
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        originalEnv = process.env;
        process.env = { ...originalEnv, OPENROUTER_API_KEY: 'test-key' };

        mockOrchestrator = {
            config: {
                projectPath: '/project'
            },
            disk: {
                ensureDir: jest.fn(),
                writeFile: jest.fn()
            }
        };

        imageGenPlugin = new ImageGenAgentPlugin(mockOrchestrator);

        mockFetch.mockReset();
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('should generate and save an image successfully (Base64 response)', async () => {
        mockFetch.mockResolvedValue({
            json: async () => ({
                choices: [{
                    message: {
                        images: [{ image_url: { url: 'base64data' } }]
                    }
                }]
            })
        } as unknown as Response);

        const agent: Agent = {
            name: 'image-gen',
            model: 'test-model',
            prompt_template: '{task_prompt}'
        };

        const result = await imageGenPlugin.execute(agent, 'Draw a cat', {
            params: { output_path: 'cat.png' }
        });

        expect(result).toContain('Image generated and saved to: /project/cat.png');

        expect(mockFetch).toHaveBeenCalledWith('https://openrouter.ai/api/v1/chat/completions', expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
                Authorization: 'Bearer test-key',
                'Content-Type': 'application/json'
            }),
            body: expect.stringContaining('"model":"test-model"')
        }));

        expect(mockOrchestrator.disk.ensureDir).toHaveBeenCalledWith('/project');
        expect(mockOrchestrator.disk.writeFile).toHaveBeenCalledWith(
            '/project/cat.png',
            Buffer.from('base64data', 'base64')
        );
    });

    it('should handle Data URI response', async () => {
        mockFetch.mockResolvedValue({
            json: async () => ({
                choices: [{
                    message: {
                        images: [{ image_url: { url: 'data:image/png;base64,base64data' } }]
                    }
                }]
            })
        } as unknown as Response);

        const agent: Agent = { name: 'image-gen' };

        await imageGenPlugin.execute(agent, 'Draw a cat', {
            params: { output_path: 'cat.png' }
        });

        expect(mockOrchestrator.disk.writeFile).toHaveBeenCalledWith(
            '/project/cat.png',
            Buffer.from('base64data', 'base64')
        );
    });

    it('should handle URL response by fetching it', async () => {
        // First call returns the URL
        mockFetch.mockResolvedValueOnce({
            json: async () => ({
                choices: [{
                    message: {
                        images: [{ image_url: { url: 'http://example.com/image.png' } }]
                    }
                }]
            })
        } as unknown as Response);

        // Second call fetches the image
        mockFetch.mockResolvedValueOnce({
            arrayBuffer: async () => Buffer.from('imagebuffer')
        } as unknown as Response);

        const agent: Agent = { name: 'image-gen' };

        await imageGenPlugin.execute(agent, 'Draw a cat', {
            params: { output_path: 'cat.png' }
        });

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(mockFetch).toHaveBeenNthCalledWith(2, 'http://example.com/image.png');

        expect(mockOrchestrator.disk.writeFile).toHaveBeenCalledWith(
            '/project/cat.png',
            Buffer.from('imagebuffer')
        );
    });

    it('should use default output path if not provided', async () => {
        mockFetch.mockResolvedValue({
            json: async () => ({
                choices: [{
                    message: {
                        images: [{ image_url: { url: 'base64data' } }]
                    }
                }]
            })
        } as unknown as Response);

        const agent: Agent = { name: 'image-gen' };

        const result = await imageGenPlugin.execute(agent, 'Draw a cat');

        expect(result).toMatch(/Image generated and saved to: .*image-\d+\.png/);
        expect(mockOrchestrator.disk.writeFile).toHaveBeenCalled();
    });

    it('should resolve relative output path', async () => {
        mockFetch.mockResolvedValue({
            json: async () => ({
                choices: [{
                    message: {
                        images: [{ image_url: { url: 'base64data' } }]
                    }
                }]
            })
        } as unknown as Response);

        const agent: Agent = { name: 'image-gen' };

        const result = await imageGenPlugin.execute(agent, 'Draw a cat', {
            params: { output_path: 'subdir/cat.png' }
        });

        expect(result).toContain('Image generated and saved to: /project/subdir/cat.png');
        expect(mockOrchestrator.disk.writeFile).toHaveBeenCalledWith(
            '/project/subdir/cat.png',
            Buffer.from('base64data', 'base64')
        );
    });

    it('should use absolute output path as is', async () => {
        mockFetch.mockResolvedValue({
            json: async () => ({
                choices: [{
                    message: {
                        images: [{ image_url: { url: 'base64data' } }]
                    }
                }]
            })
        } as unknown as Response);

        const agent: Agent = { name: 'image-gen' };

        const result = await imageGenPlugin.execute(agent, 'Draw a cat', {
            params: { output_path: '/absolute/path/cat.png' }
        });

        expect(result).toContain('Image generated and saved to: /absolute/path/cat.png');
        expect(mockOrchestrator.disk.writeFile).toHaveBeenCalledWith(
            '/absolute/path/cat.png',
            Buffer.from('base64data', 'base64')
        );
    });

    it('should throw if API key is missing', async () => {
        delete process.env.OPENROUTER_API_KEY;

        const agent: Agent = { name: 'image-gen' };

        await expect(imageGenPlugin.execute(agent, 'Draw a cat')).rejects.toThrow('Missing API Key');
    });

    it('should throw if generation fails', async () => {
        mockFetch.mockRejectedValue(new Error('Generation failed'));

        const agent: Agent = { name: 'image-gen' };

        await expect(imageGenPlugin.execute(agent, 'Draw a cat')).rejects.toThrow('Generation failed');
    });

    it('should throw if no image data returned', async () => {
        mockFetch.mockResolvedValue({
            json: async () => ({
                choices: [{
                    message: {
                        images: []
                    }
                }]
            })
        } as Response);

        const agent: Agent = { name: 'image-gen' };

        await expect(imageGenPlugin.execute(agent, 'Draw a cat')).rejects.toThrow('No image data returned');
    });

    it('should throw if result.choices is undefined', async () => {
        mockFetch.mockResolvedValue({
            json: async () => ({})
        } as unknown as Response);

        const agent: Agent = { name: 'image-gen' };

        await expect(imageGenPlugin.execute(agent, 'Draw a cat')).rejects.toThrow('No image data returned');
    });

    it('should throw if message.images is undefined', async () => {
        mockFetch.mockResolvedValue({
            json: async () => ({
                choices: [{
                    message: {}
                }]
            })
        } as unknown as Response);

        const agent: Agent = { name: 'image-gen' };

        await expect(imageGenPlugin.execute(agent, 'Draw a cat')).rejects.toThrow('No image data returned');
    });
});
