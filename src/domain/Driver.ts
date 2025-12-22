import { z, ZodSafeParseResult } from 'zod';
import { RuntimeHost } from './RuntimeHost.js';
import { ShellExecutor } from '../utils/shell.js';

export interface Skill {
    name: string;
    description?: string;
    [key: string]: any;
}

import { Result } from './Result.js';

export interface Driver<TContext = any, TResult = string> {
    name: string;
    description: string;
    isSupported(): Promise<boolean>;
    validateSkill(skill: Skill): Promise<boolean>;
    execute(skill: Skill, context?: TContext): Promise<Result<TResult, Error>>;
}

export const SkillSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    dependencies: z.array(z.string()).optional()
}).loose();

export abstract class BaseDriver<TContext = any, TResult = string> implements Driver<TContext, TResult> {
    abstract name: string;
    abstract description: string;

    protected shell: ShellExecutor;

    constructor(protected host: RuntimeHost, protected config: any = {}) {
        this.shell = new ShellExecutor(host);
    }

    abstract isSupported(): Promise<boolean>;

    protected parseSchema(skill: Skill): ZodSafeParseResult<Skill> {
        return SkillSchema.safeParse(skill);
    }

    async validateSkill(skill: Skill): Promise<boolean> {
        const result = this.parseSchema(skill);
        if (!result.success) {
            this.host.log('warn', `Validation failed for ${this.name} skill '${skill.name}': ${JSON.stringify(z.treeifyError(result.error))}`);
        }
        return result.success;
    }

    abstract run(skill: Skill, context?: TContext): Promise<TResult>;

    async execute(skill: Skill, context?: TContext): Promise<Result<TResult, Error>> {
        if (!await this.validateSkill(skill)) {
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
        } catch (e) {
            return false;
        }
    }

    protected checkEnvironment(key: string): boolean {
        return !!process.env[key];
    }

    protected checkConfig(key: string): any {
        return this.config[key];
    }
}

