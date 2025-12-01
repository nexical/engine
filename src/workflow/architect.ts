import path from 'path';
import debug from 'debug';
import yaml from 'js-yaml';
import type { Orchestrator } from '../orchestrator.js';
import { Agent } from '../models/Agent.js';

const log = debug('architect');

export class Architect {
    private architectPrompt: string;

    constructor(
        private core: Orchestrator
    ) {
        const architectPromptFile = 'architect.md';
        const coreArchitectPrompt = path.join(this.core.config.appPath, 'prompts', architectPromptFile);
        const projectArchitectPrompt = path.join(this.core.config.agentsPath, architectPromptFile);

        if (this.core.disk.exists(projectArchitectPrompt)) {
            this.architectPrompt = this.core.disk.readFile(projectArchitectPrompt);
        } else {
            this.architectPrompt = this.core.disk.readFile(coreArchitectPrompt);
        }
    }

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

        const architectureFile = '.plotris/architecture.md';
        const fullPrompt = this.architectPrompt
            .replace('{user_request}', prompt)
            .replace('{architecture_file}', architectureFile)
            .replace('{global_constraints}', globalConstraints);

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
