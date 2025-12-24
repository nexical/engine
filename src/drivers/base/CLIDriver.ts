import { z, ZodSafeParseResult } from 'zod';

import { BaseDriver, IDriverContext, ISkill, SkillSchema } from '../../domain/Driver.js';

export const CLISkillSchema = SkillSchema.extend({
  name: z.string(),
  description: z.string().optional(),
  args: z.array(z.string()).optional(),
}).passthrough();

export type CLISkill = z.infer<typeof CLISkillSchema>;

export abstract class CLIDriver<TContext extends IDriverContext = IDriverContext> extends BaseDriver<TContext, string> {
  async isSupported(): Promise<boolean> {
    return await Promise.resolve(false);
  }

  protected parseSchema(skill: ISkill): ZodSafeParseResult<CLISkill> {
    return CLISkillSchema.safeParse(skill);
  }

  protected abstract getExecutable(skill: ISkill): string;

  protected getArguments(skill: ISkill): string[] {
    return (skill.args as string[]) || [];
  }

  async run(skill: ISkill, context?: TContext): Promise<string> {
    const cliSkill = skill as CLISkill;
    const argsTemplate = this.getArguments(cliSkill);

    // Interpolate arguments with context
    // Note: If params/context values are missing, they will be empty strings
    const formatArgs: Record<string, unknown> = {
      ...(context?.params as Record<string, unknown>),
      task_id: context?.taskId,
    };

    const promptEngine = context?.promptEngine;
    if (!promptEngine) {
      throw new Error('PromptEngine is required for CLIDriver execution');
    }

    const finalArgs = argsTemplate.map((arg) => promptEngine.renderString(arg, formatArgs));

    return await this.executeShell(cliSkill, finalArgs, context);
  }

  protected async executeShell(skill: ISkill, args: Array<string>, context?: TContext): Promise<string> {
    const commandBin = this.getExecutable(skill);

    this.host.log('debug', `Running CLI skill: ${skill.name} `);
    this.host.log('debug', `Command: ${commandBin} ${args.join(' ')} `);

    try {
      const result = await this.shell.execute(commandBin, args, {
        cwd: this.config.rootDirectory,
        // Merge context.env with process.env to preserve standard vars
        env: { ...process.env, ...(context?.env || {}) },
      });

      this.host.log('debug', '--- stdout ---');
      this.host.log('info', result.stdout);
      this.host.log('debug', '--- stderr ---');
      this.host.log('error', result.stderr);

      if (result.code !== 0) {
        throw new Error(`Command exited with code ${result.code} \nStderr: ${result.stderr} `);
      }

      return result.stdout;
    } catch (err) {
      this.host.log('error', `An error occurred while executing the CLI agent: ${(err as Error).message} `);
      throw err;
    }
  }
}
