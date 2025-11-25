import path from 'path';
import debug from 'debug';
import { experimental_generateImage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { AgentPlugin, BasePlugin } from '../../models/Plugins.js';
import { Agent } from '../../models/Agent.js';

const log = debug('agent:image-gen');

export class ImageGenAgentPlugin extends BasePlugin implements AgentPlugin {
    name = 'image-gen-agent';
    description = 'Generates images using AI SDK and saves them to a file.';

    async execute(agent: Agent, taskPrompt: string, context: any = {}): Promise<string> {
        const promptTemplate = agent.prompt_template || '{prompt}';
        const params = context.params || {};

        // Interpolate prompt
        let prompt = promptTemplate;
        const formatArgs = {
            user_request: context.userPrompt || '',
            task_prompt: taskPrompt,
            ...params
        };

        for (const [key, value] of Object.entries(formatArgs)) {
            prompt = prompt.replace(new RegExp(`{${key}}`, 'g'), String(value));
        }

        const provider = (agent.provider || 'openrouter').toLowerCase();
        const modelName = agent.model || 'openai/dall-e-3'; // Default model
        const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;

        if (!apiKey) {
            throw new Error('Missing API Key for image generation (OPENROUTER_API_KEY or OPENAI_API_KEY)');
        }

        let model;
        if (provider === 'openrouter') {
            const openrouter = createOpenAI({
                baseURL: 'https://openrouter.ai/api/v1',
                apiKey: apiKey,
            });
            model = openrouter.image(modelName);
        } else if (provider === 'openai') {
            const openai = createOpenAI({
                apiKey: apiKey,
            });
            model = openai.image(modelName);
        } else {
            throw new Error(`Unsupported image provider: ${provider}`);
        }

        log(`Generating image with provider: ${provider}, model: ${modelName}`);
        log(`Prompt: ${prompt}`);

        const size = params.size || agent.size;
        const aspectRatio = params.aspectRatio || agent.aspectRatio;

        try {
            const { image } = await experimental_generateImage({
                model,
                prompt,
                n: 1,
                size: size,
                aspectRatio: aspectRatio,
            });

            const base64Data = image.base64;
            if (!base64Data) {
                throw new Error('No image data returned from provider.');
            }

            // Determine output path
            let outputPath = params.output_path;
            if (!outputPath) {
                const fileName = `image-${Date.now()}.png`;
                outputPath = path.join(this.core.config.projectPath, fileName);
            } else if (!path.isAbsolute(outputPath)) {
                outputPath = path.join(this.core.config.projectPath, outputPath);
            }

            // Ensure directory exists
            this.core.disk.ensureDir(path.dirname(outputPath));

            // Write file
            const buffer = Buffer.from(base64Data, 'base64');
            this.core.disk.writeFile(outputPath, buffer);

            log(`Image saved to: ${outputPath}`);
            return `Image generated and saved to: ${outputPath}`;

        } catch (error) {
            console.error('Image generation failed:', error);
            throw error;
        }
    }
}
