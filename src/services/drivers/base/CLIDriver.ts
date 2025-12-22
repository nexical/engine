import { Driver, Skill, SkillSchema, BaseDriver } from '../../../domain/Driver.js';
import { RuntimeHost } from '../../../domain/RuntimeHost.js';
import { interpolate } from '../../../common/utils/interpolation.js';
import { z, ZodSafeParseResult } from 'zod';

export const CLISkillSchema = SkillSchema.extend({
    name: z.string(),
    description: z.string().optional(),
    args: z.array(z.string()).optional(),
}).loose();

export type CLISkill = z.infer<typeof CLISkillSchema>;

export abstract class CLIDriver extends BaseDriver {

    async isSupported(): Promise<boolean> {
        return false;
    }

    protected parseSchema(skill: Skill): ZodSafeParseResult<CLISkill> {
        return CLISkillSchema.safeParse(skill);
    }

    protected abstract getExecutable(skill: Skill): string;

    protected getArguments(skill: Skill): string[] {
        return skill.args || [];
    }

    async run(skill: Skill, context: any = {}): Promise<string> {
        const cliSkill = skill as CLISkill;
        const params = context.params || {};

        const formatArgs: Record<string, any> = {
            user_request: context.userPrompt || '',
            task_id: context.taskId || '',
            ...params
        };

        const argsTemplate = this.getArguments(cliSkill);
        const finalArgs = argsTemplate.map(arg => interpolate(arg, formatArgs));

        return await this.executeShell(cliSkill, finalArgs, context);
    }

    protected async executeShell(skill: Skill, args: Array<string>, context: any = {}): Promise<string> {
        const commandBin = this.getExecutable(skill);

        this.host.log('debug', `Running CLI skill: ${skill.name}`);
        this.host.log('debug', `Command: ${commandBin} ${args.join(' ')}`);

        try {
            const result = await this.shell.execute(commandBin, args, {
                cwd: this.config.rootDirectory,
                // Merge context.env with process.env to preserve standard vars
                env: { ...process.env, ...(context.env || {}) }
            });

            this.host.log('debug', "--- stdout ---");
            this.host.log('info', result.stdout);
            this.host.log('debug', "--- stderr ---");
            this.host.log('error', result.stderr);

            if (result.code !== 0) {
                throw new Error(`Command exited with code ${result.code}\nStderr: ${result.stderr}`);
            }

            return result.stdout;
        } catch (err) {
            this.host.log('error', `An error occurred while executing the CLI agent: ${(err as Error).message}`);
            throw err;
        }
    }
}
