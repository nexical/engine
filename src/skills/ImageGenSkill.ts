import path from 'path';
import debug from 'debug';
import { Skill, BaseSkill, Capabilities } from '../models/Skill.js';
import { Agent } from '../models/Agent.js';
import { ShellExecutor } from '../utils/shell.js';

const log = debug('skill:image-gen');

export class ImageGenSkill extends BaseSkill implements Skill {
    name = 'image-gen';
    description = 'Generates images using AI SDK and saves them to a file.';

    isSupported(capabilities: Capabilities): boolean {
        return true;
    }

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

        const modelName = agent.model || 'google/gemini-3-pro-image-preview'; // Default model

        // Aspect ratio 	1K resolution 	1K Tokens 	2K resolution 	2K Tokens 	4K resolution 	4K Tokens
        // 1:1 	            1024x1024 	    1210 	    2048x2048 	    1210 	    4096x4096 	    2000
        // 2:3 	            848x1264 	    1210 	    1696x2528 	    1210 	    3392x5056 	    2000
        // 3:2 	            1264x848 	    1210 	    2528x1696 	    1210 	    5056x3392 	    2000
        // 3:4 	            896x1200 	    1210 	    1792x2400 	    1210 	    3584x4800 	    2000
        // 4:3 	            1200x896 	    1210 	    2400x1792 	    1210 	    4800x3584 	    2000
        // 4:5 	            928x1152 	    1210 	    1856x2304 	    1210 	    3712x4608 	    2000
        // 5:4 	            1152x928 	    1210 	    2304x1856 	    1210 	    4608x3712 	    2000
        // 9:16 	        768x1376 	    1210 	    1536x2752 	    1210 	    3072x5504 	    2000
        // 16:9 	        1376x768 	    1210 	    2752x1536 	    1210 	    5504x3072 	    2000
        // 21:9 	        1584x672 	    1210 	    3168x1344 	    1210 	    6336x2688 	    2000

        const aspectRatio = params.aspectRatio || agent.aspectRatio || '1:1';
        const resolution = params.resolution || agent.resolution || '1K';

        if (!process.env.OPENROUTER_API_KEY) {
            throw new Error('Missing API Key for image generation (OPENROUTER_API_KEY)');
        }

        log(`Generating image with model: ${modelName}`);
        log(`Prompt: ${prompt}`);
        log(`Aspect ratio: ${aspectRatio}`);
        log(`Resolution: ${resolution}`);

        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: [
                        {
                            role: 'user',
                            content: prompt,
                        },
                    ],
                    modalities: ['image', 'text'],
                    image_config: {
                        aspect_ratio: aspectRatio,
                        image_size: resolution,
                    },
                }),
            });

            const result = await response.json();
            let base64Data: string | null = null;

            if (result.choices) {
                const message = result.choices[0].message;
                if (message.images) {
                    for (const image of message.images) {
                        const url = image.image_url.url;
                        if (url.startsWith('http')) {
                            const imgResp = await fetch(url);
                            const arrayBuffer = await imgResp.arrayBuffer();
                            base64Data = Buffer.from(arrayBuffer).toString('base64');
                        } else if (url.startsWith('data:')) {
                            base64Data = url.split(',')[1];
                        } else {
                            base64Data = url;
                        }
                    }
                }
            }
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
