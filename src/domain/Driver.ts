import { z, ZodSafeParseResult } from 'zod';

import { FileSystemService } from '../services/FileSystemService.js';
import { IPromptEngine } from '../services/PromptEngine.js';
import { ShellService } from '../services/ShellService.js';
import { IFileSystem } from './IFileSystem.js';
import { Result } from './Result.js';
import { IRuntimeHost } from './RuntimeHost.js';

export interface ISkill {
  name: string;
  description?: string;
  provider?: string;
  dependencies?: string[];
  worktree_setup?: string[];
  hydration?: string[];
  sparse_checkout?: string[];
  [key: string]: unknown;
}

export interface IDriverContext {
  userPrompt?: string;
  taskId?: string;
  taskPrompt?: string;
  cwd?: string;
  params?: Record<string, unknown>;
  promptEngine?: IPromptEngine;
  env?: Record<string, string>;
}

export interface IDriver<TContext = IDriverContext, TResult = string> {
  name: string;
  description: string;
  isSupported(): Promise<boolean>;
  validateSkill(skill: ISkill): Promise<boolean>;
  execute(skill: ISkill, context?: TContext): Promise<Result<TResult, Error>>;
}

export const SkillSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    provider: z.string().optional(),
    dependencies: z.array(z.string()).optional(),
    worktree_setup: z.array(z.string()).optional(),
    hydration: z.array(z.string()).optional(),
    sparse_checkout: z.array(z.string()).optional(),
  })
  .passthrough();

export interface IDriverConfig {
  rootDirectory: string;
  defaultDriver?: string;
  [key: string]: unknown;
}

export abstract class BaseDriver<TContext = IDriverContext, TResult = string> implements IDriver<TContext, TResult> {
  abstract name: string;
  abstract description: string;

  protected shell: ShellService;
  protected fileSystem: IFileSystem;

  constructor(
    protected host: IRuntimeHost,
    protected config: IDriverConfig = { rootDirectory: process.cwd() },
    fileSystem?: IFileSystem,
  ) {
    this.shell = new ShellService(host);
    this.fileSystem = fileSystem || new FileSystemService(host);
  }

  abstract isSupported(): Promise<boolean>;

  protected parseSchema(skill: ISkill): ZodSafeParseResult<ISkill> {
    return SkillSchema.safeParse(skill);
  }

  async validateSkill(skill: ISkill): Promise<boolean> {
    const result = await Promise.resolve(this.parseSchema(skill));
    if (!result.success) {
      this.host.log(
        'warn',
        `Validation failed for ${this.name} skill '${skill.name}': ${JSON.stringify(z.treeifyError(result.error))}`,
      );
    }
    return result.success;
  }

  abstract run(skill: ISkill, context?: TContext): Promise<TResult>;

  async execute(skill: ISkill, context?: TContext): Promise<Result<TResult, Error>> {
    if (!(await this.validateSkill(skill))) {
      return Result.fail(new Error(`Invalid skill for ${this.name} driver: ${skill.name}`));
    }
    try {
      const output = await this.run(skill, context);
      return Result.ok(output);
    } catch (e) {
      return Result.fail(e instanceof Error ? e : new Error(String(e)));
    }
  }

  protected async checkExecutable(name: string): Promise<boolean> {
    try {
      await this.shell.execute('which', [name]);
      return true;
    } catch {
      return false;
    }
  }

  protected checkEnvironment(key: string): boolean {
    return !!process.env[key];
  }

  protected checkConfig(key: string): unknown {
    return this.config[key];
  }
}
