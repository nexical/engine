import path from 'path';
import debug from 'debug';
import yaml from 'js-yaml';
import type { Orchestrator } from '../orchestrator.js';
import { Agent } from '../models/Agent.js';

const log = debug('architect');

export class Architect {
    constructor(private core: Orchestrator) { }

    private getGlobalConstraints(): string {
        const agentsMdPath = this.core.config.agentsDefinitionPath;
        if (this.core.disk.exists(agentsMdPath)) {
            return this.core.disk.readFile(agentsMdPath);
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

        const architectureFile = this.core.config.architecturePath;
        const personasDir = this.core.config.personasPath;

        const fullPrompt = this.core.promptEngine.render('architect.md', {
            user_request: prompt,
            architecture_file: architectureFile,
            global_constraints: globalConstraints,
            personas_dir: personasDir,
            evolution_log: evolutionLog
        });

        const architectAgent: Agent = {
            name: 'architect',
            command: architectCliCommand,
            args: architectCliArgs,
            prompt_template: '{prompt}' // The fullPrompt is already constructed
        };

        if (this.core.identityManager && this.core.jobContext) {
            try {
                const { teamId, projectId, jobId } = this.core.jobContext;
                const token = await this.core.identityManager.getAgentToken(teamId, projectId, jobId);
                if (token) {
                    process.env.NEXICAL_AGENT_TOKEN = token;
                }
            } catch (e) {
                console.error("Failed to get agent token for architect:", e);
            }
        }

        try {
            const skill = this.core.skillRegistry.get('cli');
            if (!skill) {
                throw new Error("CLI skill not found for architect.");
            }

            // Execute the architect agent. It should write the architectur to architectureFile.
            await skill.execute(architectAgent, '', {
                userPrompt: prompt,
                params: {
                    prompt: fullPrompt
                },
                env: process.env.NEXICAL_AGENT_TOKEN ? { NEXICAL_AGENT_TOKEN: process.env.NEXICAL_AGENT_TOKEN } : {}
            });

        } catch (e) {
            console.error("Error generating architecture:", e);
            throw e;
        }
    }
}
