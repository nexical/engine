import { FileSystemService } from '../../services/FileSystemService.js';
import { Project } from './Project.js';
import { ArchitectureDocument } from '../artifacts/ArchitectureDocument.js';
import { PlanDocument } from '../artifacts/PlanDocument.js';

export class Workspace {
    private disk: FileSystemService;

    constructor(private project: Project) {
        this.disk = new FileSystemService();
    }

    public async getArchitecture(name: string): Promise<ArchitectureDocument> {
        // 'name' param ignored for now as we only support 'current', 
        // but kept for future history support
        const path = this.project.paths.architectureCurrent;
        if (this.disk.exists(path)) {
            const content = this.disk.readFile(path);
            return new ArchitectureDocument(content);
        }
        return new ArchitectureDocument("");
    }

    public async saveArchitecture(doc: ArchitectureDocument): Promise<void> {
        this.disk.writeFileAtomic(this.project.paths.architectureCurrent, doc.content);
    }

    public async loadPlan(): Promise<PlanDocument> {
        const path = this.project.paths.planCurrent;
        if (this.disk.exists(path)) {
            const content = this.disk.readFile(path);
            return PlanDocument.fromYaml(content);
        }
        return new PlanDocument();
    }

    public async savePlan(doc: PlanDocument): Promise<void> {
        this.disk.writeFileAtomic(this.project.paths.planCurrent, doc.toYaml());
    }

    public archiveArtifacts(): void {
        // Implementation to move current architecture/plan to archive
        // Logic to be moved from Workflow/Application if exists
    }
}
