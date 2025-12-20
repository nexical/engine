import { Driver, BaseDriver, Skills } from '../models/Driver.js';
import { Skill } from '../models/Skill.js';
import { ShellExecutor } from '../utils/shell.js';
import { interpolate } from '../utils/interpolation.js';
import debug from 'debug';

const log = debug('driver:cli');

export class CLIDriver extends BaseDriver implements Driver {
    name = 'cli';
    description = 'Executes skills using a CLI command.'; // Updated description too

    isSupported(skills: Skills): boolean {
        return true; // CLI execution is always supported in this environment
    }

    async execute(skill: Skill, taskPrompt: string, context: any = {}): Promise<string> {
        const promptTemplate = skill.prompt_template || '';
        const params = context.params || {};

        const formatArgs: Record<string, any> = {
            user_request: context.userPrompt || '',
            task_id: context.taskId || '',
            task_prompt: taskPrompt,
            ...params
        };

        // Interpolate prompt
        const prompt = interpolate(promptTemplate, formatArgs);

        const commandBin = skill.command || 'gemini';
        const argsTemplate = skill.args || ['prompt', '{prompt}', '--yolo'];

        formatArgs['prompt'] = prompt;

        const finalArgs = argsTemplate.map(arg => interpolate(arg, formatArgs));

        log(`Running CLI skill: ${skill.name}`);
        log(`Command: ${commandBin} ${finalArgs.join(' ')}`);

        try {
            const result = await ShellExecutor.execute(commandBin, finalArgs, {
                cwd: this.core.config.workingDirectory,
                // Merge context.env with process.env to preserve standard vars
                env: { ...process.env, ...(context.env || {}) }
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
