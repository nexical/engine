#!/usr/bin/env node
import { Command } from 'commander';
import debug from 'debug';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Orchestrator } from './orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.resolve(__dirname, '../../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

const log = debug('cli');
const program = new Command();

program
    .name('nexical')
    .description('Extensible AI-driven multi-agent planner and orchstrator for local project development')
    .version(packageJson.version)
    .option('--prompt <prompt>', 'A AI-driven prompt to drive orchestration engine or a /command.')
    .argument('[command]', 'Command to execute')
    .argument('[args...]', 'Arguments for the command');

program.parse(process.argv);

const options = program.opts();
const args = program.args;

try {
    const orchestrator = new Orchestrator(process.argv);
    await orchestrator.init();

    if (options.prompt) {
        await orchestrator.execute(options.prompt);
    } else if (args.length > 0) {
        const commandName = args[0];
        const commandArgs = args.slice(1);
        const fullCommand = `/${commandName} ${commandArgs.join(' ')}`;
        await orchestrator.execute(fullCommand);
    } else {
        // Interactive mode
        console.log("Entering interactive mode. Type 'exit' to quit.");
        const readline = await import('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: 'instruction> '
        });

        rl.prompt();
        rl.on('line', async (line) => {
            const prompt = line.trim();
            if (prompt.toLowerCase() === 'exit') {
                rl.close();
                return;
            }
            if (prompt) {
                await orchestrator.execute(prompt);
            }
            rl.prompt();
        }).on('close', () => {
            console.log('\nExiting interactive mode.');
            process.exit(0);
        });
    }
} catch (e) {
    console.error(`Application error: ${e}`);
    process.exit(1);
}
