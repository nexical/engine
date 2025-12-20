import { Driver, Capabilities } from '../interfaces/Driver.js';
export type { Driver };
export type Skills = Capabilities;
import { Skill } from './Skill.js';
import type { Orchestrator } from '../orchestrator.js';

export abstract class BaseDriver implements Driver {
    abstract name: string;
    abstract description: string;

    constructor(protected core: Orchestrator) { }

    abstract isSupported(skills: Capabilities): boolean;
    abstract execute(skill: Skill, taskPrompt: string, context?: any): Promise<string>;
}
