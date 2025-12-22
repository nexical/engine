import { FileSystemService } from '../services/FileSystemService.js';
import { Project } from './Project.js';
import { Architecture } from './Architecture.js';
import { Plan } from './Plan.js';
import { Signal, SignalType } from '../workflow/Signal.js';
import yaml from 'js-yaml';
import path from 'path';

export class Workspace {
    private disk: FileSystemService;

    constructor(private project: Project) {
        this.disk = new FileSystemService();
    }

    public async getArchitecture(name: string): Promise<Architecture> {
        // 'name' param ignored for now as we only support 'current', 
        // but kept for future history support
        const path = this.project.paths.architectureCurrent;
        if (this.disk.exists(path)) {
            const content = this.disk.readFile(path);
            return new Architecture(content);
        }
        return new Architecture("");
    }

    public async saveArchitecture(doc: Architecture): Promise<void> {
        this.disk.writeFileAtomic(this.project.paths.architectureCurrent, doc.content);
    }

    public async loadPlan(): Promise<Plan> {
        const path = this.project.paths.planCurrent;
        if (this.disk.exists(path)) {
            const content = this.disk.readFile(path);
            return Plan.fromYaml(content);
        }
        return new Plan("New Plan", []);
    }

    public async savePlan(doc: Plan): Promise<void> {
        this.disk.writeFileAtomic(this.project.paths.planCurrent, doc.toYaml());
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
                    const data = yaml.load(content) as any;
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
}
