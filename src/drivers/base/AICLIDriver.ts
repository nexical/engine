import { CLIDriver, CLISkillSchema } from './CLIDriver.js';
import { Skill, DriverContext } from '../../domain/Driver.js';
import { interpolate } from '../../utils/interpolation.js';
import { z, ZodSafeParseResult } from 'zod';

export const AISkillSchema = CLISkillSchema.extend({
    prompt_template: z.string()
}).loose();

export type AISkill = z.infer<typeof AISkillSchema>;

export abstract class AICLIDriver<TContext extends DriverContext = DriverContext> extends CLIDriver<TContext> {

    async isSupported(): Promise<boolean> {
        return false;
    }

    protected parseSchema(skill: Skill): ZodSafeParseResult<AISkill> {
        return AISkillSchema.safeParse(skill);
    }

    protected abstract getExecutable(skill: AISkill): string;
    protected abstract getArguments(skill: AISkill): string[];

    async run(skill: Skill, context?: TContext): Promise<string> {
        const aiSkill = skill as AISkill;
        const promptTemplate = aiSkill.prompt_template || '';
        const params = (context as DriverContext | undefined)?.params || {};

        const formatArgs: Record<string, unknown> = {
            user_request: (context as DriverContext | undefined)?.userPrompt || '',
            task_id: (context as DriverContext | undefined)?.taskId || '',
            task_prompt: (context as DriverContext | undefined)?.taskPrompt,
            ...params
        };
        formatArgs['prompt'] = interpolate(promptTemplate, formatArgs);

        const argsTemplate = this.getArguments(aiSkill);
        const finalArgs = argsTemplate.map(arg => interpolate(arg, formatArgs));

        return await this.executeShell(aiSkill, finalArgs, context);
    }
}
