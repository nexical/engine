import { FileSystemService } from '../services/FileSystemService.js';
import { Architecture } from './Architecture.js';
import { Plan } from './Plan.js';
import { Signal, SignalType } from '../workflow/Signal.js';
import yaml from 'js-yaml';
import path from 'path';
import { EngineState } from './State.js';
import { IProject } from './Project.js';


export interface IWorkspace {
    getArchitecture(name: string): Promise<Architecture>;
    saveArchitecture(doc: Architecture): Promise<void>;
    loadPlan(): Promise<Plan>;
    savePlan(doc: Plan): Promise<void>;
    archiveArtifacts(): void;
    detectSignal(): Promise<Signal | null>;
    clearSignals(): Promise<void>;
    saveState(state: EngineState): Promise<void>;
    loadState(): Promise<EngineState | undefined>;
    flush(): Promise<void>;
}

export class Workspace implements IWorkspace {
    private disk: FileSystemService;
    private cache: Map<string, any> = new Map();
    private pendingWrites: Set<Promise<void>> = new Set();

    constructor(private project: IProject) {
        this.disk = project.fileSystem as FileSystemService;
    }

    private async scheduleWrite(filePath: string, content: string): Promise<void> {
        const promise = (async () => {
            const release = await this.disk.acquireLock(filePath);
            try {
                this.disk.writeFileAtomic(filePath, content);
            } finally {
                release();
            }
        })();

        this.pendingWrites.add(promise);
        try {
            await promise;
        } catch (e) {
            console.error(`Async write failed for ${filePath}:`, e);
        } finally {
            this.pendingWrites.delete(promise);
        }
    }

    public async flush(): Promise<void> {
        await Promise.all(Array.from(this.pendingWrites));
    }

    public async getArchitecture(name: string): Promise<Architecture> {
        if (this.cache.has('architecture')) {
            return this.cache.get('architecture') as Architecture;
        }

        const path = this.project.paths.architectureCurrent;
        if (this.disk.exists(path)) {
            const content = this.disk.readFile(path);
            const doc = new Architecture(content);
            this.cache.set('architecture', doc);
            return doc;
        }
        return new Architecture("");
    }

    public async saveArchitecture(doc: Architecture): Promise<void> {
        this.cache.set('architecture', doc);
        this.scheduleWrite(this.project.paths.architectureCurrent, doc.content);
    }

    public async loadPlan(): Promise<Plan> {
        if (this.cache.has('plan')) {
            return this.cache.get('plan') as Plan;
        }

        const path = this.project.paths.planCurrent;
        if (this.disk.exists(path)) {
            const content = this.disk.readFile(path);
            const plan = Plan.fromYaml(content);
            this.cache.set('plan', plan);
            return plan;
        }
        return new Plan("New Plan", []);
    }

    public async savePlan(doc: Plan): Promise<void> {
        this.cache.set('plan', doc);
        this.scheduleWrite(this.project.paths.planCurrent, doc.toYaml());
    }

    public archiveArtifacts(): void {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archiveDir = this.project.paths.archive;

        // Archive architecture
        const archCurrent = this.project.paths.architectureCurrent;
        if (this.disk.exists(archCurrent)) {
            const archArchive = path.join(archiveDir, `${timestamp}.architecture.md`);
            this.disk.copy(archCurrent, archArchive);
        }

        // Archive plan
        const planCurrent = this.project.paths.planCurrent;
        if (this.disk.exists(planCurrent)) {
            const planArchive = path.join(archiveDir, `${timestamp}.plan.yml`);
            this.disk.copy(planCurrent, planArchive);
        }
    }

    /**
     * Detects if any signal files exist in the signals directory.
     * Returns the first valid signal found, or null.
     */
    public async detectSignal(): Promise<Signal | null> {
        const signalsDir = this.project.paths.signals;
        if (!this.disk.isDirectory(signalsDir)) return null;

        const files = this.disk.listFiles(signalsDir);
        for (const file of files) {
            if (file.endsWith('.signal.yml') || file.endsWith('.signal.yaml')) {
                const content = this.disk.readFile(`${signalsDir}/${file}`);
                try {
                    const data = yaml.load(content) as { type: string, reason: string, metadata?: Record<string, any> };
                    // Validate minimal signal structure
                    if (!data || !data.type || !data.reason) {
                        console.warn(`Invalid signal file content in ${file}`);
                        continue;
                    }
                    return new Signal(data.type as SignalType, data.reason, data.metadata);
                } catch (e) {
                    console.error(`Failed to parse signal file ${file}:`, e);
                }
            }
        }
        return null;
    }

    /**
     * Clears all signal files from the signals directory.
     */
    public async clearSignals(): Promise<void> {
        const signalsDir = this.project.paths.signals;
        if (this.disk.isDirectory(signalsDir)) {
            const files = this.disk.listFiles(signalsDir);
            for (const file of files) {
                this.disk.deleteFile(`${signalsDir}/${file}`);
            }
        }
    }
    public async saveState(state: EngineState): Promise<void> {
        await this.scheduleWrite(this.project.paths.state, state.toYaml());
    }

    public async loadState(): Promise<EngineState | undefined> {
        if (this.disk.exists(this.project.paths.state)) {
            const content = this.disk.readFile(this.project.paths.state);
            return EngineState.fromYaml(content);
        }
        return undefined;
    }
}
