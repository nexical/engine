import path from 'path';
import type { Orchestrator } from '../orchestrator.js';
import { AISkill } from '../drivers/base/AICLIDriver.js';
import { GeminiDriver } from '../drivers/GeminiDriver.js';

export class Architect {
    constructor(private core: Orchestrator) { }

    private getGlobalConstraints(): string {
        const constraintsPath = this.core.config.constraintsPath;
        if (this.core.disk.exists(constraintsPath)) {
            return this.core.disk.readFile(constraintsPath);
        }
        return "There are no global constraints defined.";
    }
    private getEvolutionLog(): string {
        const logPath = this.core.config.logPath;
        if (this.core.disk.exists(logPath)) {
            return this.core.disk.readFile(logPath);
        }
        return "No historical failures recorded.";
    }

    async generateArchitecture(prompt: string): Promise<void> {
        const globalConstraints = this.getGlobalConstraints();
        const evolutionLog = this.getEvolutionLog();
        const architecturePath = this.core.config.architecturePath;
        const personasDir = this.core.config.personasDirectory;

        const fullPrompt = this.core.promptEngine.render(this.core.config.architecturePromptFile, {
            user_request: prompt,
            global_constraints: globalConstraints,
            architecture_path: architecturePath,
            personas_dir: personasDir,
            evolution_log: evolutionLog
        });

        const architectSkill: AISkill = {
            name: 'architect',
            prompt_template: '{prompt}' // The fullPrompt is already constructed
        };

        try {
            const driver = this.core.driverRegistry.get('gemini') as GeminiDriver;
            await driver.execute(architectSkill, {
                userPrompt: prompt,
                params: {
                    prompt: fullPrompt
                }
            });

            this.saveArchitectureToHistory();

        } catch (e) {
            this.core.host.log('error', `Error generating architecture: ${e}`);
            throw e;
        }
    }

    private saveArchitectureToHistory(): void {
        const architecturePath = this.core.config.architecturePath;

        if (!this.core.disk.exists(architecturePath)) {
            this.core.host.log('debug', `Architecture file not found at ${architecturePath}, skipping history save.`);
            return;
        }

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        const filename = `architecture-${year}-${month}-${day}.${hours}-${minutes}-${seconds}.md`;
        const historyPath = path.join(this.core.config.architectureDirectory, filename);

        // Copy instead of move to keep the 'current' valid
        const content = this.core.disk.readFile(architecturePath);
        this.core.disk.writeFileAtomic(historyPath, content);

        this.core.host.log('debug', `Saved architecture history to: ${historyPath}`);
    }
}
