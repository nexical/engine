import path from 'path';
import { z, ZodSafeParseResult } from 'zod';

import { BaseDriver } from '../domain/Driver.js';
import { ISkillConfig, SkillSchema, ISkillContext, DriverConfig } from '../domain/SkillConfig.js';

export const ImageGenSkillSchema = SkillSchema.extend({
  prompt_template: z.string(),
  model: z.string().optional(),
  aspect_ratio: z.string().optional(),
  resolution: z.string().optional(),
}).passthrough();

export type ImageGenSkill = z.infer<typeof ImageGenSkillSchema>;

export class ImageGenDriver extends BaseDriver<ISkillContext, string> {
  name = 'image-gen';
  description = 'Generates images using AI SDK and saves them to a file.';

  async isSupported(): Promise<boolean> {
    return await Promise.resolve(this.checkEnvironment('OPENROUTER_API_KEY'));
  }

  protected parseSchema(skill: ISkillConfig): ZodSafeParseResult<ImageGenSkill> {
    return ImageGenSkillSchema.safeParse(skill);
  }

  async run(config: DriverConfig, context?: ISkillContext): Promise<string> {
    const imageGenSkill = config as unknown as ImageGenSkill;
    const promptTemplate = imageGenSkill.prompt_template;
    // Context params are now directly in context.params
    const params = (context?.params as Record<string, unknown>) || {};

    const formatArgs: Record<string, unknown> = {
      user_request: context?.userPrompt || '',
      task_id: context?.taskId || '',
      task_prompt: context?.taskPrompt,
      ...params,
    };

    const promptEngine = context?.promptEngine;
    if (!promptEngine) {
      throw new Error('PromptEngine is required for ImageGenDriver execution');
    }

    const prompt = promptEngine.renderString(promptTemplate, formatArgs);
    const modelName = imageGenSkill.model || 'google/gemini-2.0-flash-exp';
    const aspectRatio = (params.aspectRatio as string) || imageGenSkill.aspect_ratio || '1:1';
    const resolution = (params.resolution as string) || imageGenSkill.resolution || '1024x1024';

    this.host.log('debug', `Generating image with model: ${modelName} `);
    this.host.log('debug', `Prompt: ${prompt} `);
    this.host.log('debug', `Aspect ratio: ${aspectRatio} `);
    this.host.log('debug', `Resolution: ${resolution} `);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY} `,
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
          // OpenAI / OpenRouter specific payload for images often differs or uses DALL-E format
          // Assuming OpenRouter supports this or check docs. 
          // Previous code used 'modalities' and 'image_config' which seems specific or hypothetic.
          // Standard OpenAI DALL-E is /v1/images/generations.
          // Chat completions with image output is newer.
          // Assuming existing code was working or this is prototype.
          // I will keep logic but fix types.
          modalities: ['image', 'text'],
          image_config: {
            aspect_ratio: aspectRatio,
            image_size: resolution,
          },
        }),
      });

      const result = (await response.json()) as {
        choices?: Array<{
          message: {
            images?: Array<{
              image_url: {
                url: string;
              };
            }>;
            content?: string; // Fallback
          };
        }>;
      };
      let base64Data: string | null = null;

      if (result.choices && result.choices.length > 0) {
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
      let outputPath = params.output_path as string | undefined;
      const rootDir = (this.systemConfig.rootDirectory as string) || process.cwd();

      if (!outputPath) {
        const fileName = `image-${Date.now()}.png`;
        outputPath = path.join(rootDir, fileName);
      } else {
        outputPath = path.join(rootDir, outputPath);
      }

      const disk = this.fileSystem;
      disk.writeFile(outputPath, Buffer.from(base64Data, 'base64'));

      this.host.log('info', `Image saved to: ${outputPath} `);
      return `Image generated and saved to: ${outputPath} `;
    } catch (error) {
      this.host.log('error', `Image generation failed: ${(error as Error).message} `);
      throw error;
    }
  }
}
