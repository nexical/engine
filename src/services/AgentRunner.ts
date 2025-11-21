import path from 'path';
import yaml from 'js-yaml';
import { spawnSync } from 'child_process';
import { Task } from '../data_models/Task.js';
import { Project } from '../data_models/Project.js';
import { FileSystemService } from './FileSystemService.js';

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

    constructor(
        private projectPath: string,
        private fsService: FileSystemService
    ) {
        this.loadYamlProfiles();
    }

    private loadYamlProfiles(): void {
        let agentsDir = path.join(this.projectPath, '.builder', 'agents');
        if (!this.fsService.isDirectory(agentsDir)) {
            return;
        }

        const files = this.fsService.listFiles(agentsDir);
        for (const filename of files) {
            if (filename.endsWith('.agent.yml') || filename.endsWith('.agent.yaml')) {
                const filePath = path.join(agentsDir, filename);
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

    runAgent(task: Task, project: Project, userPrompt: string): Project {
        console.log(task.notice);

        if (this.agents[task.agent]) {
            return this.runYamlAgent(task, project, userPrompt);
        }

        console.warn(`Warning: Agent '${task.agent}' not found. Skipping task.`);
        return project;
    }

    private runYamlAgent(task: Task, project: Project, userPrompt: string): Project {
        const profile = this.agents[task.agent];
        return this.executeCliAgent(task, profile, project, userPrompt);
    }

    private executeCliAgent(task: Task, profile: AgentProfile, project: Project, userPrompt: string): Project {
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

        console.log(`Running CLI agent: ${task.agent}`);
        console.log(`Command: ${commandBin} ${finalArgs.join(' ')}`);

        try {
            const result = spawnSync(commandBin, finalArgs, {
                cwd: project.project_path,
                encoding: 'utf-8',
                stdio: ['inherit', 'pipe', 'pipe'] // Inherit stdin, pipe stdout/stderr
            });

            console.log("--- stdout ---");
            console.log(result.stdout);
            console.log("--- stderr ---");
            console.log(result.stderr);

            if (result.status !== 0) {
                console.warn(`Warning: Command exited with code ${result.status}`);
            }
        } catch (e) {
            console.error(`An error occurred while executing the CLI agent: ${e}`);
        }

        return project;
    }
}
