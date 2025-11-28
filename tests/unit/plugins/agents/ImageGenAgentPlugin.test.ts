import { jest, expect, describe, it, beforeEach, afterEach } from '@jest/globals';
import type { ImageGenAgentPlugin as ImageGenAgentPluginType } from '../../../../src/plugins/agents/ImageGenAgentPlugin.js';
import type { Agent } from '../../../../src/models/Agent.js';

const mockGenerateImage = jest.fn() as any;
const mockCreateOpenAI = jest.fn();
const mockOpenAIImage = jest.fn();

jest.unstable_mockModule('ai', () => ({
    experimental_generateImage: mockGenerateImage
}));

jest.unstable_mockModule('@ai-sdk/openai', () => ({
    createOpenAI: mockCreateOpenAI
}));

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

        mockGenerateImage.mockReset();
        mockCreateOpenAI.mockReset();
        mockOpenAIImage.mockReset();

        mockCreateOpenAI.mockReturnValue({
            image: mockOpenAIImage
        });
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('should generate and save an image successfully', async () => {
        mockGenerateImage.mockResolvedValue({
            image: { base64: 'base64data' }
        } as any);

        const agent: Agent = {
            name: 'image-gen',
            model: 'test-model',
            prompt_template: '{task_prompt}'
        };

        const result = await imageGenPlugin.execute(agent, 'Draw a cat', {
            params: { output_path: 'cat.png' }
        });

        expect(result).toContain('Image generated and saved to: /project/cat.png');

        expect(mockCreateOpenAI).toHaveBeenCalledWith(expect.objectContaining({
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey: 'test-key'
        }));
        expect(mockOpenAIImage).toHaveBeenCalledWith('test-model');
        expect(mockGenerateImage).toHaveBeenCalledWith(expect.objectContaining({
            prompt: 'Draw a cat',
            n: 1
        }));

        expect(mockOrchestrator.disk.ensureDir).toHaveBeenCalledWith('/project');
        expect(mockOrchestrator.disk.writeFile).toHaveBeenCalledWith(
            '/project/cat.png',
            Buffer.from('base64data', 'base64')
        );
    });

    it('should use default output path if not provided', async () => {
        mockGenerateImage.mockResolvedValue({
            image: { base64: 'base64data' }
        } as any);

        const agent: Agent = {
            name: 'image-gen'
        };

        const result = await imageGenPlugin.execute(agent, 'Draw a cat');

        expect(result).toMatch(/Image generated and saved to: .*image-\d+\.png/);
        expect(mockOrchestrator.disk.writeFile).toHaveBeenCalled();
    });

    it('should resolve relative output path', async () => {
        mockGenerateImage.mockResolvedValue({
            image: { base64: 'base64data' }
        } as any);

        const agent: Agent = { name: 'image-gen' };

        const result = await imageGenPlugin.execute(agent, 'Draw a cat', {
            params: { output_path: 'subdir/cat.png' }
        });

        expect(result).toContain('Image generated and saved to: /project/subdir/cat.png');
        expect(mockOrchestrator.disk.writeFile).toHaveBeenCalledWith(
            '/project/subdir/cat.png',
            expect.any(Buffer)
        );
    });

    it('should use absolute output path as is', async () => {
        mockGenerateImage.mockResolvedValue({
            image: { base64: 'base64data' }
        } as any);

        const agent: Agent = { name: 'image-gen' };

        const result = await imageGenPlugin.execute(agent, 'Draw a cat', {
            params: { output_path: '/absolute/path/cat.png' }
        });

        expect(result).toContain('Image generated and saved to: /absolute/path/cat.png');
        expect(mockOrchestrator.disk.writeFile).toHaveBeenCalledWith(
            '/absolute/path/cat.png',
            expect.any(Buffer)
        );
    });

    it('should throw if API key is missing', async () => {
        delete process.env.OPENROUTER_API_KEY;
        delete process.env.OPENAI_API_KEY;

        const agent: Agent = {
            name: 'image-gen'
        };

        await expect(imageGenPlugin.execute(agent, 'Draw a cat')).rejects.toThrow('Missing API Key');
    });

    it('should throw if generation fails', async () => {
        mockGenerateImage.mockRejectedValue(new Error('Generation failed'));

        const agent: Agent = {
            name: 'image-gen'
        };

        await expect(imageGenPlugin.execute(agent, 'Draw a cat')).rejects.toThrow('Generation failed');
    });

    it('should throw if no image data returned', async () => {
        mockGenerateImage.mockResolvedValue({
            image: { base64: undefined }
        } as any);

        const agent: Agent = {
            name: 'image-gen'
        };

        await expect(imageGenPlugin.execute(agent, 'Draw a cat')).rejects.toThrow('No image data returned');
    });
});
