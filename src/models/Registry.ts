import type { Orchestrator } from '../orchestrator.js';

export interface Registry<T> {
    register(item: T): void;
    get(name: string): T | undefined;
    getAll(): T[];
}

export class BaseRegistry {
    constructor(protected core: Orchestrator) { }
}
