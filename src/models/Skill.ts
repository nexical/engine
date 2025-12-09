import { Agent } from './Agent.js';
import type { Orchestrator } from '../orchestrator.js';

export interface Capabilities {
    binaries: Record<string, boolean>; // e.g. { 'terraform': true }
}

export interface Skill {
    name: string;
    description: string;
    isSupported(capabilities: Capabilities): boolean;
    execute(agent: Agent, taskPrompt: string, context?: any): Promise<string>;
}

export abstract class BaseSkill implements Skill {
    abstract name: string;
    abstract description: string;

    constructor(protected core: Orchestrator) { }

    abstract isSupported(capabilities: Capabilities): boolean;
    abstract execute(agent: Agent, taskPrompt: string, context?: any): Promise<string>;
}
