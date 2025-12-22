import path from 'path';
import debug from 'debug';
import yaml from 'js-yaml';
import type { Orchestrator } from '../orchestrator.js';
import { Skill } from '../interfaces/Skill.js';

const log = debug('architect');

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

        const architectCliCommand = process.env.ARCHITECT_CLI_COMMAND || 'gemini';
        let architectCliArgs: string[];

        if (process.env.ARCHITECT_CLI_ARGS) {
            architectCliArgs = yaml.load(process.env.ARCHITECT_CLI_ARGS) as string[];
        } else {
            architectCliArgs = ['prompt', '{prompt}', '--yolo'];
        }

        const architecturePath = this.core.config.architecturePath;
        const personasDir = this.core.config.personasDirectory;

        const fullPrompt = this.core.promptEngine.render(this.core.config.architecturePromptFile, {
            user_request: prompt,
            global_constraints: globalConstraints,
            architecture_path: architecturePath,
            personas_dir: personasDir,
            evolution_log: evolutionLog
        });

        const architectSkill: Skill = {
            name: 'architect',
            command: architectCliCommand,
            args: architectCliArgs,
            prompt_template: '{prompt}' // The fullPrompt is already constructed
        };

        try {
            const driver = this.core.driverRegistry.get('cli');
            if (!driver) {
                throw new Error("CLI driver not found for architect.");
            }

            // Execute the architect skill. It should write the architectur to architectureFile.
            await driver.execute(architectSkill, {
                userPrompt: prompt,
                params: {
                    prompt: fullPrompt
                }
            });

            this.saveArchitectureToHistory();

        } catch (e) {
            console.error("Error generating architecture:", e);
            throw e;
        }
    }

    private saveArchitectureToHistory(): void {
        const architecturePath = this.core.config.architecturePath;

        if (!this.core.disk.exists(architecturePath)) {
            log(`Architecture file not found at ${architecturePath}, skipping history save.`);
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

        log(`Saved architecture history to: ${historyPath}`);
    }
}
