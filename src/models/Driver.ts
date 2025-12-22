import debug from 'debug';
import { z, ZodSafeParseResult } from 'zod';
import type { Orchestrator } from '../orchestrator.js';
import { Skill } from '../interfaces/Skill.js';
import { ShellExecutor } from '../utils/shell.js';

export interface Driver {
    name: string;
    description: string;
    isSupported(): Promise<boolean>;
    validateSkill(skill: Skill): Promise<boolean>;
    execute(skill: Skill, context?: any): Promise<string>;
}

const log = debug('driver:base');

export const SkillSchema = z.object({
    name: z.string(),
    description: z.string().optional()
}).loose();

export abstract class BaseDriver implements Driver {
    abstract name: string;
    abstract description: string;

    constructor(protected core: Orchestrator) { }

    abstract isSupported(): Promise<boolean>;

    protected parseSchema(skill: Skill): ZodSafeParseResult<Skill> {
        return SkillSchema.safeParse(skill);
    }

    async validateSkill(skill: Skill): Promise<boolean> {
        const result = this.parseSchema(skill);
        if (!result.success) {
            log(`Validation failed for ${this.name} skill '${skill.name}':`, z.treeifyError(result.error));
        }
        return result.success;
    }

    abstract run(skill: Skill, context?: any): Promise<string>;

    async execute(skill: Skill, context: any = {}): Promise<string> {
        if (!this.validateSkill(skill)) {
            throw new Error(`Invalid skill for ${this.name} driver: ${skill.name}`);
        }
        return await this.run(skill, context);
    }

    protected async checkExecutable(name: string): Promise<boolean> {
        try {
            await ShellExecutor.execute('which', [name]);
            return true;
        } catch (e) {
            return false;
        }
    }

    protected checkEnvironment(key: string): boolean {
        return !!process.env[key];
    }

    protected checkConfig(key: string): any {
        return (this.core.config as any)[key];
    }
}

