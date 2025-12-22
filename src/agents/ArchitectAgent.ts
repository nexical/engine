import { Brain } from './Brain.js';
import { Project } from '../domain/Project.js';
import { Workspace } from '../domain/Workspace.js';
import { Architecture } from '../domain/Architecture.js';
import { AISkill } from '../drivers/base/AICLIDriver.js';
import { GeminiDriver } from '../drivers/GeminiDriver.js';
import yaml from 'js-yaml'; // For history log parsing if needed, though Project should handle it.

export class ArchitectAgent {
    constructor(
        private brain: Brain,
        private project: Project,
        private workspace: Workspace
    ) { }

    public async design(userRequest: string): Promise<Architecture> {
        const constraints = this.project.getConstraints();
        const evolutionLog = this.brain.getEvolution().getLogSummary();

        const fullPrompt = this.brain.getPromptEngine().render(this.project.paths.architecturePrompt, {
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

        const driver = this.brain.getDriver('gemini') || this.brain.getDefaultDriver();
        if (!driver) throw new Error("No driver available for Architect.");

        await driver.execute(architectSkill, {
            userPrompt: userRequest,
            params: {
                prompt: fullPrompt
            }
        });

        // After execution, we reload from disk to return the object.
        const doc = await this.workspace.getArchitecture('current');

        // Save history
        await this.saveHistory(doc);

        return doc;
    }

    private async saveHistory(doc: Architecture): Promise<void> {
        // Save to archive (TBD in Workspace/Project)
    }
}
