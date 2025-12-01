import path from 'path';
import debug from 'debug';
import yaml from 'js-yaml';
import type { Orchestrator } from '../orchestrator.js';
import { Agent } from '../models/Agent.js';

const log = debug('architect');

export class Architect {
    constructor(private core: Orchestrator) { }

    private getGlobalConstraints(): string {
        const agentsMdPath = path.join(this.core.config.projectPath, 'AGENTS.md');
        if (this.core.disk.exists(agentsMdPath)) {
            return this.core.disk.readFile(agentsMdPath);
        }
        return "There are no global constraints defined.";
    }

    async generateArchitecture(prompt: string): Promise<void> {
        const globalConstraints = this.getGlobalConstraints();

        const architectCliCommand = process.env.ARCHITECT_CLI_COMMAND || 'gemini';
        let architectCliArgs: string[];

        if (process.env.ARCHITECT_CLI_ARGS) {
            architectCliArgs = yaml.load(process.env.ARCHITECT_CLI_ARGS) as string[];
        } else {
            architectCliArgs = ['prompt', '{prompt}', '--yolo'];
        }

        const architectureFile = '.nexical/architecture.md';
        const personasDir = '.nexical/personas/';

        const fullPrompt = this.core.promptEngine.render('architect.md', {
            user_request: prompt,
            architecture_file: architectureFile,
            global_constraints: globalConstraints,
            personas_dir: personasDir
        });

        const architectAgent: Agent = {
            name: 'architect',
            command: architectCliCommand,
            args: architectCliArgs,
            prompt_template: '{prompt}' // The fullPrompt is already constructed
        };

        try {
            const plugin = this.core.agentRegistry.get('cli');
            if (!plugin) {
                throw new Error("CLI plugin not found for architect.");
            }

            // Execute the architect agent. It should write the architectur to architectureFile.
            await plugin.execute(architectAgent, '', {
                userPrompt: prompt,
                params: {
                    prompt: fullPrompt
                }
            });

        } catch (e) {
            console.error("Error generating architecture:", e);
            throw e;
        }
    }
}
