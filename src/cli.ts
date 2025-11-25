#!/usr/bin/env node
import { Command } from 'commander';
import dotenv from 'dotenv';
import debug from 'debug';
import { Orchestrator } from './orchestrator.js';

dotenv.config({ quiet: true });

const log = debug('cli');
const program = new Command();

program
    .name('plotris')
    .description('Extensible AI-driven multi-agent planner and orchstrator for local project development')
    .version('0.1.0');

program
    .option('--prompt <prompt>', 'A AI-driven prompt to drive orchestration engine or a /command.');

program.parse(process.argv);

const options = program.opts();
try {
    const orchestrator = new Orchestrator(process.argv);
    await orchestrator.init();

    if (options.prompt) {
        await orchestrator.execute(options.prompt);
    } else {
        // Interactive mode or help
        if (process.argv.length <= 2) {
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
        } else {
            program.help();
        }
    }
} catch (e) {
    console.error(`Application error: ${e}`);
    process.exit(1);
}
