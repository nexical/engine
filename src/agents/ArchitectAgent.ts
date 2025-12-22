import { Project } from '../domain/Project.js';
import { Workspace } from '../domain/Workspace.js';
import { Architecture } from '../domain/Architecture.js';
import { AISkill } from '../drivers/base/AICLIDriver.js';
import { PromptEngine } from '../services/PromptEngine.js';
import { DriverRegistry } from '../drivers/Registry.js';
import { EvolutionService } from '../services/EvolutionService.js';

export class ArchitectAgent {
    constructor(
        private project: Project,
        private workspace: Workspace,
        private promptEngine: PromptEngine,
        private driverRegistry: DriverRegistry,
        private evolutionService: EvolutionService
    ) { }

    public async design(userRequest: string): Promise<Architecture> {
        const constraints = this.project.getConstraints();
        const evolutionLog = this.evolutionService.getLogSummary();

        const fullPrompt = this.promptEngine.render(this.project.paths.architecturePrompt, {
            user_request: userRequest,
            global_constraints: constraints,
            architecture_file: this.project.paths.architectureCurrent,
            personas_dir: this.project.paths.personas,
            evolution_log: evolutionLog
        });

        const architectSkill: AISkill = {
            name: 'architect',
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
