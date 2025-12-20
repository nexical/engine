import { Skill } from './Skill.js';
import type { Orchestrator } from '../orchestrator.js';

export interface Skills {
    binaries: Record<string, boolean>; // e.g. { 'terraform': true }
}

export interface Driver {
    name: string;
    description: string;
    isSupported(skills: Skills): boolean;
    execute(skill: Skill, taskPrompt: string, context?: any): Promise<string>;
}

export abstract class BaseDriver implements Driver {
    abstract name: string;
    abstract description: string;

    constructor(protected core: Orchestrator) { }

    abstract isSupported(skills: Skills): boolean;
    abstract execute(skill: Skill, taskPrompt: string, context?: any): Promise<string>;
}
