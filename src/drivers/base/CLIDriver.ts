import { z, ZodSafeParseResult } from 'zod';

import { BaseDriver } from '../../domain/Driver.js';
import { ISkillConfig, SkillSchema, ISkillContext, DriverConfig } from '../../domain/SkillConfig.js';

export const CLISkillSchema = SkillSchema.extend({
  name: z.string(),
  description: z.string().default(''),
  args: z.array(z.string()).optional(),
}).passthrough();

export type CLISkill = z.infer<typeof CLISkillSchema>;

export abstract class CLIDriver<TContext extends ISkillContext = ISkillContext> extends BaseDriver<TContext, string> {
  async isSupported(): Promise<boolean> {
    return await Promise.resolve(false);
  }

  protected parseSchema(skill: ISkillConfig): ZodSafeParseResult<CLISkill> {
    return CLISkillSchema.safeParse(skill);
  }

  protected abstract getExecutable(skill: ISkillConfig): string;

  protected getArguments(skill: ISkillConfig): string[] {
    const s = skill as CLISkill;
    return (s.args as string[]) || [];
  }

  async run(config: DriverConfig, context?: TContext): Promise<string> {
    const cliSkill = config as unknown as CLISkill;
    const argsTemplate = this.getArguments(cliSkill);

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

  protected async executeShell(skill: ISkillConfig, args: Array<string>, context?: TContext): Promise<string> {
    const commandBin = this.getExecutable(skill);

    this.host.log('debug', `Running CLI skill: ${skill.name} `);
    this.host.log('debug', `Command: ${commandBin} ${args.join(' ')} `);

    const rootDir = (this.systemConfig.rootDirectory as string) || process.cwd();

    try {
      const result = await this.shell.execute(commandBin, args, {
        cwd: rootDir,
        // Merge context.env with process.env? access unknown prop
        env: { ...process.env, ...((context as any)?.env || {}) },
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
