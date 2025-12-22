import { IProject } from '../domain/Project.js';
import { IWorkspace } from '../domain/Workspace.js';
import { Architecture } from '../domain/Architecture.js';
import { AISkill } from '../drivers/base/AICLIDriver.js';
import { IPromptEngine } from '../services/PromptEngine.js';
import { IDriverRegistry } from '../drivers/DriverRegistry.js';
import { IEvolutionService } from '../services/EvolutionService.js';

export class ArchitectAgent {
    constructor(
        private project: IProject,
        private workspace: IWorkspace,
        private promptEngine: IPromptEngine,
        private driverRegistry: IDriverRegistry,
        private evolution: IEvolutionService
    ) { }

    public async design(userRequest: string): Promise<Architecture> {
        const constraints = this.project.getConstraints();
        const evolutionLog = this.evolution.getLogSummary();

        const fullPrompt = this.promptEngine.render(this.project.paths.architecturePrompt, {
            user_request: userRequest,
            global_constraints: constraints,
            architecture_file: this.project.paths.architectureCurrent,
            personas_dir: this.project.paths.personas,
            evolution_log: evolutionLog
        });

        const skillName = this.project.getConfig().agents?.['architect']?.skill || 'architect';
        const architectSkill: AISkill = {
            name: skillName,
            prompt_template: '{prompt}'
        };

        const driver = this.driverRegistry.get('gemini') || this.driverRegistry.getDefault();
        if (!driver) throw new Error("No driver available for Architect.");

        const result = await driver.execute(architectSkill, {
            userPrompt: userRequest,
            params: {
                prompt: fullPrompt
            }
        });

        if (result.isFail()) {
            throw result.error();
        }

        // After execution, we reload from disk to return the object.
        const doc = await this.workspace.getArchitecture('current');

        // Save history (archiving previous artifacts)
        await this.saveHistory(doc);

        return doc;
    }

    private async saveHistory(doc: Architecture): Promise<void> {
        this.workspace.archiveArtifacts();
    }
}
