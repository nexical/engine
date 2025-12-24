import { z, ZodSafeParseResult } from 'zod';

import { IDriverContext, ISkill } from '../../domain/Driver.js';
import { CLIDriver, CLISkillSchema } from './CLIDriver.js';

export const AISkillSchema = CLISkillSchema.extend({
  prompt_template: z.string(),
}).passthrough();

export type AISkill = z.infer<typeof AISkillSchema>;

export abstract class AICLIDriver<TContext extends IDriverContext = IDriverContext> extends CLIDriver<TContext> {
  async isSupported(): Promise<boolean> {
    return await Promise.resolve(false);
  }

  protected parseSchema(skill: ISkill): ZodSafeParseResult<AISkill> {
    return AISkillSchema.safeParse(skill);
  }

  protected abstract getExecutable(skill: AISkill): string;
  protected abstract getArguments(skill: AISkill): string[];

  async run(skill: ISkill, context?: TContext): Promise<string> {
    const aiSkill = skill as AISkill;
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
