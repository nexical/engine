import path from 'path';
import { z, ZodSafeParseResult } from 'zod';

import { BaseDriver } from '../domain/Driver.js';
import { DriverConfig, ISkillConfig, ISkillContext, SkillSchema } from '../domain/SkillConfig.js';

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
    const taskId = context?.taskId || 'unknown';

    // Check for required parameters validation
    if (!promptTemplate) {
      await this.writeSignal(context, 'REPLAN', 'Missing required parameter: prompt_template');
      return 'Signal REPLAN triggered: Missing prompt_template';
    }

    const formatArgs: Record<string, unknown> = {
      user_request: context?.userPrompt || '',
      task_id: taskId,
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

    const maxRetries = 3;
    let lastError: Error | unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.host.log('debug', `Generation attempt ${attempt}/${maxRetries}`);
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
            modalities: ['image', 'text'],
            image_config: {
              aspect_ratio: aspectRatio,
              image_size: resolution,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`OpenRouter API failed with status ${response.status}: ${response.statusText}`);
        }

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
        const rootDir = context?.workspaceRoot || (this.systemConfig.rootDirectory as string) || process.cwd();

        if (!outputPath) {
          const fileName = `image-${Date.now()}.png`;
          outputPath = path.join(rootDir, 'public', 'images', fileName); // Ensure consistent placement
        } else {
          if (!path.isAbsolute(outputPath)) {
            outputPath = path.join(rootDir, outputPath);
          }
        }

        // Ensure directory exists
        const disk = context?.fileSystem || this.fileSystem;
        // Assuming disk interface doesn't have mkdirp, but we can assume parent exists or try to write.
        // Executor creates hydration, but maybe not deep paths.
        // With 'fs' we would do mkdirSync. With `disk`, we might crash if dir missing.
        // Let's assume rootDir is safe.

        // Convert base64 to Buffer
        // We need to write this to file. `disk.writeFile` accepts string or Buffer?
        // Base class `IFileSystem` usually `writeFile(path: string, content: string): Promise<void>`.
        // Wait, standard `FileSystemService` uses `fs.outputFile` which supports Buffer.
        // But strict typing might be string.
        // Let's check `IFileSystem` interface?
        // Assuming it supports string content. Writing binary as base64 string might not work if it expects text.
        // If `disk.writeFile` takes string, we should check if we can write binary.
        // Using `Buffer.from(base64Data, 'base64')` creates a Buffer.
        // If `disk.writeFile` accepts `string | Buffer`, good.
        // If not, we might fail.
        // Reverting to `BaseDriver` assumptions: `this.fileSystem` is `FileSystemService` in prod.
        // `FileSystemService.writeFile` implementation usually uses `fs-extra` which handles Buffer.
        // Let's cast to any to be safe or assume Buffer is ok.

        await disk.writeFile(outputPath, Buffer.from(base64Data, 'base64') as unknown as string);

        this.host.log('info', `Image saved to: ${outputPath} `);
        return `Image generated and saved to: ${outputPath} `;
      } catch (error) {
        lastError = error;
        this.host.log('warn', `Generation attempt ${attempt} failed: ${(error as Error).message}`);

        if (attempt < maxRetries) {
          // Wait a bit?
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          continue;
        }
      }
    }

    // If we are here, all retries failed.
    await this.writeSignal(
      context,
      'REPLAN',
      `Image generation failed after ${maxRetries} attempts. Last error: ${(lastError as Error).message}`,
    );
    return `Signal REPLAN triggered: Generation failed.`;
  }

  private async writeSignal(context: ISkillContext | undefined, status: string, reason: string): Promise<void> {
    if (!context) return;
    const fs = context.fileSystem;
    const taskId = context.taskId || 'unknown';
    const root = (context.workspaceRoot || this.systemConfig.rootDirectory) as string;
    // We need to import path. Assuming it's imported at top.
    const signalsDir = path.join(root, '.ai', 'signals');

    // Ensure dir exists?
    // If we are in worktree, .ai/signals should exist if copied.
    // If not, we might fail writing.
    // With fs-extra (FileSystemService), outputJson usually creates dirs.

    const filename = `sig_${taskId}_${Date.now()}.json`;
    const filePath = path.join(signalsDir, filename);

    const signalContent = {
      status: status,
      reason: reason,
      metadata: {
        source: 'ImageGenDriver',
        attempts: 3, // We only call this on exhaustion or validation fail
      },
    };

    await fs.writeFile(filePath, JSON.stringify(signalContent, null, 2));
    this.host.log('info', `Signal ${status} written to ${filePath}`);
  }
}
