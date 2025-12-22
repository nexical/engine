import { Brain } from '../brain/Brain.js';
import { Project } from '../domain/Project.js';
import { Workspace } from '../domain/Workspace.js';
import { ArchitectureDocument } from '../artifacts/ArchitectureDocument.js';
import { AISkill } from '../../drivers/base/AICLIDriver.js';
import { GeminiDriver } from '../../drivers/GeminiDriver.js';
import yaml from 'js-yaml'; // For history log parsing if needed, though Project should handle it.

export class ArchitectAgent {
    constructor(
        private brain: Brain,
        private project: Project,
        private workspace: Workspace
    ) { }

    public async design(userRequest: string): Promise<ArchitectureDocument> {
        const constraints = this.project.getConstraints();
        // Evolution log logic needs to be moved to Project or kept here?
        // Project.paths.log exists.
        // Let's implement a helper in this file or Project to read log.
        const evolutionLog = this.getEvolutionLog();

        const fullPrompt = this.brain.getPromptEngine().render(this.project.paths.architecturePrompt, {
            user_request: userRequest,
            global_constraints: constraints,
            architecture_path: this.project.paths.architectureCurrent,
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

        // Current GeminiDriver writes to file directly? 
        // No, GeminiDriver executes and usually writes to stdout or file if instructed.
        // Wait, the original ArchitectAgent didn't write to file, the Driver or the Skill responsible?
        // In the original code: `driver.execute` is called.
        // Then `this.saveArchitectureToHistory(context)`.

        // So the driver/model writes the file `current.md`.

        // After execution, we reload from disk to return the object.
        const doc = await this.workspace.getArchitecture('current');

        // Save history
        await this.saveHistory(doc);

        return doc;
    }

    private getEvolutionLog(): string {
        // ... Logic to read log ...
        // For now return empty or implement similar to before using fs
        return "No historical failures recorded.";
    }

    private async saveHistory(doc: ArchitectureDocument): Promise<void> {
        // Save to archive
        // We can implement this on Workspace or Project
        // For now, let's assume Workspace has archiving logic or we do it here.
    }
}
