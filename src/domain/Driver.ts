import { FileSystemService } from '../services/FileSystemService.js';
import { ShellService } from '../services/ShellService.js';
import { IFileSystem } from './IFileSystem.js';
import { Result } from './Result.js';
import { IRuntimeHost } from './RuntimeHost.js';
import { DriverConfig, ISkillConfig, ISkillContext } from './SkillConfig.js';

export interface IDriverContext extends ISkillContext {
  [key: string]: unknown;
}

export interface IDriver<TContext = ISkillContext, TResult = string> {
  name: string;
  description: string;
  isSupported(): Promise<boolean>;
  validateConfig(config: DriverConfig): Promise<boolean>;
  execute(config: DriverConfig, context?: TContext): Promise<Result<TResult, Error>>;
}

// Legacy ISkill is restored for test compatibility. Use Skill class and ISkillConfig for new code.
export type ISkill = ISkillConfig;

export abstract class BaseDriver<TContext = ISkillContext, TResult = string> implements IDriver<TContext, TResult> {
  abstract name: string;
  abstract description: string;

  protected shell: ShellService;
  protected fileSystem: IFileSystem;

  constructor(
    protected host: IRuntimeHost,
    // config in constructor is typically for the DRIVER instance (e.g. timeout), NOT the skill execution config.
    // We keep this for system-level driver config.
    protected systemConfig: Record<string, unknown> = {},
    fileSystem?: IFileSystem,
  ) {
    this.shell = new ShellService(host);
    this.fileSystem = fileSystem || new FileSystemService(host);
  }

  abstract isSupported(): Promise<boolean>;

  // Validates the per-execution config (from YAML)
  validateConfig(_config: DriverConfig): Promise<boolean> {
    // Default implementation: check if provider matches?
    // Or just return true (polymorphic passthrough)
    return Promise.resolve(true);
  }

  abstract run(config: DriverConfig, context?: TContext): Promise<TResult>;

  async execute(config: DriverConfig, context?: TContext): Promise<Result<TResult, Error>> {
    if (!(await this.validateConfig(config))) {
      return Result.fail(new Error(`Invalid config for ${this.name} driver`));
    }
    try {
      const output = await this.run(config, context);
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
}
