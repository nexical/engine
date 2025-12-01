import path from 'path';
import yaml from 'js-yaml';
import debug from 'debug';
import { Task } from '../models/Task.js';
import { Agent } from '../models/Agent.js';
import type { Orchestrator } from '../orchestrator.js';

const log = debug('agent-runner');

export class AgentRunner {
    private agents: Record<string, Agent> = {};

    constructor(
        private core: Orchestrator
    ) {
        this.loadYamlProfiles();
    }

    private loadYamlProfiles(): void {
        if (!this.core.disk.isDirectory(this.core.config.agentsPath)) {
            return;
        }

        const files = this.core.disk.listFiles(this.core.config.agentsPath);
        for (const filename of files) {
            if (filename.endsWith('.agent.yml') || filename.endsWith('.agent.yaml')) {
                const filePath = path.join(this.core.config.agentsPath, filename);
                const content = this.core.disk.readFile(filePath);
                try {
                    const profile = yaml.load(content) as Agent;
                    if (profile && profile.name) {
                        this.agents[profile.name] = profile;
                    }
                } catch (e) {
                    console.error(`Error loading agent profile ${filename}:`, e);
                }
            }
        }
    }

    async runAgent(task: Task, userPrompt: string): Promise<void> {
        console.log(task.message);

        const profile = this.agents[task.agent];
        if (!profile) {
            throw new Error(`Agent '${task.agent}' not found.`);
        }

        await this.executeAgent(task, profile, userPrompt);
    }

    private async executeAgent(task: Task, profile: Agent, userPrompt: string): Promise<void> {
        // Determine which plugin to use. 
        // For now, we default to the default plugin (Gemini CLI) unless the agent profile specifies otherwise.
        // Future: profile.plugin could specify the plugin name.

        // Determine which plugin to use. 
        let plugin;
        if (profile.provider) {
            plugin = this.core.agentRegistry.get(profile.provider);
            if (!plugin) {
                throw new Error(`Plugin '${profile.provider}' not found.`);
            }
        } else {
            plugin = this.core.agentRegistry.getDefault();
        }

        if (!plugin) {
            throw new Error("No agent plugin found for execution.");
        }

        let userPromptWithPersona = userPrompt;
        let personaContext = '';

        if (task.persona) {
            const personaFile = path.join(this.core.config.projectPath, '.nexical/personas', `${task.persona}.md`);
            if (this.core.disk.exists(personaFile)) {
                personaContext = this.core.disk.readFile(personaFile);
            } else {
                console.warn(`Persona file not found: ${personaFile}`);
            }
        }

        userPromptWithPersona = this.core.promptEngine.render('agent.md', {
            user_prompt: userPrompt,
            persona_context: personaContext
        });

        try {
            await plugin.execute(profile, task.description, {
                userPrompt: userPromptWithPersona,
                taskId: task.id,
                params: task.params
            });
        } catch (err) {
            console.error(`An error occurred while executing the agent ${task.agent}: ${err}`);
            throw err;
        }
    }
}
