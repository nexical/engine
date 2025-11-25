import path from 'path';
import yaml from 'js-yaml';
import debug from 'debug';
import { Application } from '../data_models/Application.js';
import { Task } from '../data_models/Task.js';
import { Agent } from '../data_models/Agent.js';
import { FileSystemService } from './FileSystemService.js';
import { AgentRegistry } from '../plugins/AgentRegistry.js';

const log = debug('agent-runner');

export class AgentRunner {
    private agents: Record<string, Agent> = {};
    private fsService: FileSystemService

    constructor(
        private config: Application,
        private agentRegistry: AgentRegistry
    ) {
        this.fsService = new FileSystemService();
        this.loadYamlProfiles();
    }

    private loadYamlProfiles(): void {
        if (!this.fsService.isDirectory(this.config.agentsPath)) {
            return;
        }

        const files = this.fsService.listFiles(this.config.agentsPath);
        for (const filename of files) {
            if (filename.endsWith('.agent.yml') || filename.endsWith('.agent.yaml')) {
                const filePath = path.join(this.config.agentsPath, filename);
                const content = this.fsService.readFile(filePath);
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
            log(`Warning: Agent '${task.agent}' not found. Skipping task.`);
            return;
        }

        await this.executeAgent(task, profile, userPrompt);
    }

    private async executeAgent(task: Task, profile: Agent, userPrompt: string): Promise<void> {
        // Determine which plugin to use. 
        // For now, we default to the default plugin (Gemini CLI) unless the agent profile specifies otherwise.
        // Future: profile.plugin could specify the plugin name.

        const plugin = this.agentRegistry.getDefault();
        if (!plugin) {
            throw new Error("No default agent plugin registered.");
        }

        try {
            await plugin.execute(profile, task.description, {
                config: this.config,
                userPrompt: userPrompt,
                taskId: task.id,
                params: task.params
            });
        } catch (err) {
            console.error(`An error occurred while executing the agent ${task.agent}: ${err}`);
            throw err;
        }
    }
}
