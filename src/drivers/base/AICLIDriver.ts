import { CLIDriver, CLISkillSchema } from './CLIDriver.js';
import { Skill } from '../../domain/Driver.js';
import { interpolate } from '../../utils/interpolation.js';
import { z, ZodSafeParseResult } from 'zod';

export const AISkillSchema = CLISkillSchema.extend({
    prompt_template: z.string()
}).loose();

export type AISkill = z.infer<typeof AISkillSchema>;

export abstract class AICLIDriver<TContext = any> extends CLIDriver<TContext> {

    async isSupported(): Promise<boolean> {
        return false;
    }

    protected parseSchema(skill: Skill): ZodSafeParseResult<AISkill> {
        return AISkillSchema.safeParse(skill);
    }

    protected abstract getExecutable(skill: AISkill): string;
    protected abstract getArguments(skill: AISkill): string[];

    async run(skill: Skill, context: any = {}): Promise<string> {
        const aiSkill = skill as AISkill;
        const promptTemplate = aiSkill.prompt_template || '';
        const params = context.params || {};

        const formatArgs: Record<string, any> = {
            user_request: context.userPrompt || '',
            task_id: context.taskId || '',
            task_prompt: context.taskPrompt,
            ...params
        };
        formatArgs['prompt'] = interpolate(promptTemplate, formatArgs);

        const argsTemplate = this.getArguments(aiSkill);
        const finalArgs = argsTemplate.map(arg => interpolate(arg, formatArgs));

        return await this.executeShell(aiSkill as any, finalArgs, context);
    }
}
