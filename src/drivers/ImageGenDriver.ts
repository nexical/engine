import path from 'path';
import debug from 'debug';
import { z, ZodSafeParseResult } from 'zod';
import { BaseDriver, SkillSchema } from '../models/Driver.js';
import { Skill } from '../interfaces/Skill.js';
import { interpolate } from '../utils/interpolation.js';

const log = debug('driver:image-gen');

export const ImageGenSkillSchema = SkillSchema.extend({
    prompt_template: z.string(),
    model: z.string().optional(),
    aspect_ratio: z.string().optional(),
    resolution: z.string().optional(),
}).loose();

export type ImageGenSkill = z.infer<typeof ImageGenSkillSchema>;

export class ImageGenDriver extends BaseDriver {
    name = 'image-gen';
    description = 'Generates images using AI SDK and saves them to a file.';

    async isSupported(): Promise<boolean> {
        return this.checkEnvironment('OPENROUTER_API_KEY');
    }

    protected parseSchema(skill: Skill): ZodSafeParseResult<ImageGenSkill> {
        return ImageGenSkillSchema.safeParse(skill);
    }

    async run(skill: Skill, context: any = {}): Promise<string> {
        const imageGenSkill = skill as ImageGenSkill;
        const promptTemplate = imageGenSkill.prompt_template;
        const params = context.params || {};

        const formatArgs: Record<string, any> = {
            user_request: context.userPrompt || '',
            task_id: context.taskId || '',
            task_prompt: context.taskPrompt,
            ...params
        };
        const prompt = interpolate(promptTemplate, formatArgs);
        const modelName = imageGenSkill.model || 'google/gemini-3-pro-image-preview';
        const aspectRatio = params.aspectRatio || imageGenSkill.aspect_ratio || '1:1';
        const resolution = params.resolution || imageGenSkill.resolution || '1K';

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
                outputPath = path.join(this.core.config.rootDirectory, fileName);
            } else {
                outputPath = path.join(this.core.config.rootDirectory, outputPath);
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
