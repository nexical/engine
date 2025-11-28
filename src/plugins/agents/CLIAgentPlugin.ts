import path from 'path';
import debug from 'debug';
import { AgentPlugin, BasePlugin } from '../../models/Plugins.js';
import { Agent } from '../../models/Agent.js';
import { ShellExecutor } from '../../utils/shell.js';
import { interpolate } from '../../utils/interpolation.js';

const log = debug('agent:cli');

export class CLIAgentPlugin extends BasePlugin implements AgentPlugin {
    name = 'cli';
    description = 'Executes agents using a CLI command.';

    async execute(agent: Agent, taskPrompt: string, context: any = {}): Promise<string> {
        const promptTemplate = agent.prompt_template || '';
        const params = context.params || {};

        const formatArgs: Record<string, any> = {
            user_request: context.userPrompt || '',
            task_id: context.taskId || '',
            task_prompt: taskPrompt,
            ...params
        };

        // Interpolate prompt
        const prompt = interpolate(promptTemplate, formatArgs);

        const commandBin = agent.command || 'gemini';
        const argsTemplate = agent.args || ['prompt', '{prompt}', '--yolo'];

        formatArgs['prompt'] = prompt;

        const finalArgs = argsTemplate.map(arg => interpolate(arg, formatArgs));

        log(`Running CLI agent: ${agent.name}`);
        log(`Command: ${commandBin} ${finalArgs.join(' ')}`);

        try {
            const result = await ShellExecutor.execute(commandBin, finalArgs, {
                cwd: this.core.config.projectPath
            });

            log("--- stdout ---");
            log(result.stdout);
            log("--- stderr ---");
            log(result.stderr);

            if (result.code !== 0) {
                throw new Error(`Command exited with code ${result.code}\nStderr: ${result.stderr}`);
            }

            return result.stdout;
        } catch (err) {
            console.error(`An error occurred while executing the CLI agent: ${err}`);
            throw err;
        }
    }
}
