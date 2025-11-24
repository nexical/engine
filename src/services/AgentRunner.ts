import path from 'path';
import yaml from 'js-yaml';
import debug from 'debug';
import { AppConfig } from '../data_models/AppConfig.js';
import { Task } from '../data_models/Task.js';
import { Agent } from '../data_models/Agent.js';
import { FileSystemService } from './FileSystemService.js';
import { ShellExecutor } from '../utils/ShellExecutor.js';

const log = debug('agent-runner');

export class AgentRunner {
    private agents: Record<string, Agent> = {};
    private fsService: FileSystemService

    constructor(
        private config: AppConfig
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
        const promptTemplate = profile.prompt_template || '';
        const params = task.params || {};

        const filePath = params.file_path;
        let fileContent = '';
        if (filePath) {
            const fullPath = path.join(this.config.projectPath, filePath);
            if (this.fsService.exists(fullPath)) {
                fileContent = this.fsService.readFile(fullPath);
            } else {
                log(`Warning: File ${fullPath} not found.`);
            }
        }

        const formatArgs: Record<string, any> = {
            user_request: userPrompt,
            file_path: filePath || '',
            file_content: fileContent || '',
            task_id: task.id,
            task_prompt: task.description,
            ...params
        };

        // Interpolate prompt
        let prompt = promptTemplate;
        for (const [key, value] of Object.entries(formatArgs)) {
            prompt = prompt.replace(new RegExp(`{${key}}`, 'g'), String(value));
        }

        const commandBin = profile.command || 'gemini';
        const argsTemplate = profile.args || ['prompt', '<prompt>'];

        formatArgs['prompt'] = prompt;

        const finalArgs = argsTemplate.map(arg => {
            let formattedArg = arg;
            for (const [key, value] of Object.entries(formatArgs)) {
                formattedArg = formattedArg.replace(new RegExp(`{${key}}`, 'g'), String(value));
            }
            return formattedArg;
        });

        log(`Running CLI agent: ${task.agent}`);
        log(`Command: ${commandBin} ${finalArgs.join(' ')}`);

        try {
            const result = await ShellExecutor.execute(commandBin, finalArgs, {
                cwd: this.config.projectPath
            });

            log("--- stdout ---");
            log(result.stdout);
            log("--- stderr ---");
            log(result.stderr);

            if (result.code !== 0) {
                log(`Warning: Command exited with code ${result.code}`);
            }
        } catch (err) {
            console.error(`An error occurred while executing the CLI agent: ${err}`);
            throw err;
        }
    }
}
