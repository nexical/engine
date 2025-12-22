import { FileSystemService } from '../services/FileSystemService.js';
import { Project } from './Project.js';
import { Architecture } from './Architecture.js';
import { Plan } from './Plan.js';

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
        // Implementation to move current architecture/plan to archive
        // Logic to be moved from Workflow/Application if exists
    }
}
