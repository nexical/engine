import { Skill } from '../models/Skill.js';

export interface Capabilities {
    binaries: Record<string, boolean>;
}

export interface Driver {
    name: string;
    description: string;

    isSupported(capabilities: Capabilities): boolean;

    execute(skill: Skill, taskPrompt: string, context?: any): Promise<string>;
}
