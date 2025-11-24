import path from 'path';
import yaml from 'js-yaml';
import debug from 'debug';
import { spawn } from 'child_process';
import { AppConfig } from '../data_models/AppConfig.js';
import { Task } from '../data_models/Task.js';
import { Project } from '../data_models/Project.js';
import { FileSystemService } from './FileSystemService.js';

const log = debug('agent-runner');

interface AgentProfile {
    name: string;
    description?: string;
    prompt_template?: string;
    command?: string;
    args?: string[];
    [key: string]: any;
}

export class AgentRunner {
    private agents: Record<string, AgentProfile> = {};
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
                    const profile = yaml.load(content) as AgentProfile;
                    if (profile && profile.name) {
                        this.agents[profile.name] = profile;
                    }
                } catch (e) {
                    console.error(`Error loading agent profile ${filename}:`, e);
                }
            }
        }
    }

    async runAgent(task: Task, project: Project, userPrompt: string): Promise<Project> {
        console.log(task.message);

        if (this.agents[task.agent]) {
            return this.runYamlAgent(task, project, userPrompt);
        }

        log(`Warning: Agent '${task.agent}' not found. Skipping task.`);
        return project;
    }

    private async runYamlAgent(task: Task, project: Project, userPrompt: string): Promise<Project> {
        const profile = this.agents[task.agent];
        return this.executeCliAgent(task, profile, project, userPrompt);
    }

    private executeCliAgent(task: Task, profile: AgentProfile, project: Project, userPrompt: string): Promise<Project> {
        return new Promise((resolve, reject) => {
            const promptTemplate = profile.prompt_template || '';
            const params = task.params || {};

            const filePath = params.file_path;
            let fileContent = '';
            if (filePath) {
                const fullPath = path.join(project.project_path, filePath);
                fileContent = this.fsService.readFile(fullPath);
            }

            const formatArgs: Record<string, any> = {
                user_request: userPrompt,
                file_path: filePath || '',
                file_content: fileContent || '',
                task_prompt: task.description,
                ...params
            };

            // Interpolate prompt
            let prompt = promptTemplate;
            for (const [key, value] of Object.entries(formatArgs)) {
                prompt = prompt.replace(new RegExp(`{${key}}`, 'g'), String(value));
            }

            const commandBin = profile.command || 'gemini';
            const argsTemplate = profile.args || [];

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

            const child = spawn(commandBin, finalArgs, {
                cwd: project.project_path,
                stdio: ['inherit', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            if (child.stdout) {
                child.stdout.on('data', (data: Buffer) => {
                    const chunk = data.toString();
                    stdout += chunk;
                    process.stdout.write(chunk);
                });
            }

            if (child.stderr) {
                child.stderr.on('data', (data: Buffer) => {
                    const chunk = data.toString();
                    stderr += chunk;
                    process.stderr.write(chunk);
                });
            }

            child.on('close', (code: number) => {
                log("--- stdout ---");
                log(stdout);
                log("--- stderr ---");
                log(stderr);

                if (code !== 0) {
                    log(`Warning: Command exited with code ${code}`);
                }
                resolve(project);
            });

            child.on('error', (err: Error) => {
                console.error(`An error occurred while executing the CLI agent: ${err}`);
                reject(err);
            });
        });
    }
}
