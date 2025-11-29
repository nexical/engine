import type { Orchestrator } from '../orchestrator.js';
import { Agent } from './Agent.js';

export interface CommandPlugin {
    name: string;
    description: string;
    execute(args?: string[]): Promise<void>;
}

export interface AgentPlugin {
    name: string;
    description: string;
    execute(agent: Agent, taskPrompt: string, context?: any): Promise<string>;
}

export interface PluginRegistry<T> {
    register(plugin: T): void;
    get(name: string): T | undefined;
    getAll(): T[];
}

export class BasePlugin {
    constructor(protected core: Orchestrator) { }
}
