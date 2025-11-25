import path from 'path';
import debug from 'debug';
import { AgentPlugin, BasePlugin } from '../../data_models/Plugins.js';
import { Agent } from '../../data_models/Agent.js';
import { ShellExecutor } from '../../utils/ShellExecutor.js';
import { FileSystemService } from '../../services/FileSystemService.js';

const log = debug('agent:gemini-cli');

export class GeminiCliAgentPlugin extends BasePlugin implements AgentPlugin {
    name = 'gemini-cli';
    description = 'Executes agents using the Gemini CLI.';

    private fsService!: FileSystemService;

    protected initialize() {
        this.fsService = new FileSystemService();
    }

    async execute(agent: Agent, taskPrompt: string, context: any = {}): Promise<string> {
        const promptTemplate = agent.prompt_template || '';
        const params = context.params || {};

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
            user_request: context.userPrompt || '',
            file_path: filePath || '',
            file_content: fileContent || '',
            task_id: context.taskId || '',
            task_prompt: taskPrompt,
            ...params
        };

        // Interpolate prompt
        let prompt = promptTemplate;
        for (const [key, value] of Object.entries(formatArgs)) {
            prompt = prompt.replace(new RegExp(`{${key}}`, 'g'), String(value));
        }

        const commandBin = agent.command || 'gemini';
        const argsTemplate = agent.args || ['prompt', '<prompt>'];

        formatArgs['prompt'] = prompt;

        const finalArgs = argsTemplate.map(arg => {
            let formattedArg = arg;
            for (const [key, value] of Object.entries(formatArgs)) {
                formattedArg = formattedArg.replace(new RegExp(`{${key}}`, 'g'), String(value));
            }
            return formattedArg;
        });

        log(`Running CLI agent: ${agent.name}`);
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

            return result.stdout;
        } catch (err) {
            console.error(`An error occurred while executing the CLI agent: ${err}`);
            throw err;
        }
    }
}
