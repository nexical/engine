import { z, ZodSafeParseResult } from 'zod';

import { ISkillConfig, ISkillContext, DriverConfig } from '../../domain/SkillConfig.js';
import { CLIDriver, CLISkillSchema } from './CLIDriver.js';

export const AISkillSchema = CLISkillSchema.extend({
  prompt_template: z.string(),
}).passthrough();

export type AISkill = z.infer<typeof AISkillSchema>;

export abstract class AICLIDriver<TContext extends ISkillContext = ISkillContext> extends CLIDriver<TContext> {
  async isSupported(): Promise<boolean> {
    return await Promise.resolve(false);
  }

  protected parseSchema(skill: ISkillConfig): ZodSafeParseResult<AISkill> {
    return AISkillSchema.safeParse(skill);
  }

  protected abstract getExecutable(skill: ISkillConfig): string;
  protected abstract getArguments(skill: ISkillConfig): string[];

  async run(config: DriverConfig, context?: TContext): Promise<string> {
    const aiSkill = config as unknown as AISkill;
    const promptTemplate = aiSkill.prompt_template || '';
    const params = (context?.params as Record<string, unknown>) || {};
    const promptEngine = context?.promptEngine;

    if (!promptEngine) {
      throw new Error('PromptEngine is required in DriverContext for AISkill execution.');
    }

    const formatArgs: Record<string, unknown> = {
      user_request: context?.userPrompt || '',
      task_id: context?.taskId || '',
      task_prompt: context?.taskPrompt,
      ...params,
    };
    formatArgs['prompt'] = promptEngine.renderString(promptTemplate, formatArgs);

    const argsTemplate = this.getArguments(aiSkill);
    const finalArgs = argsTemplate.map((arg) => promptEngine.renderString(arg, formatArgs));

    return await this.executeShell(aiSkill, finalArgs, context);
  }
}
