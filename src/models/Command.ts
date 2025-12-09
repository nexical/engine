import type { Orchestrator } from '../orchestrator.js';

export interface Command {
    name: string;
    description: string;
    execute(args?: string[]): Promise<void>;
}

export abstract class BaseCommand implements Command {
    abstract name: string;
    abstract description: string;

    constructor(protected core: Orchestrator) { }

    abstract execute(args?: string[]): Promise<void>;
}
