#!/usr/bin/env node
import { Command } from 'commander';
import dotenv from 'dotenv';
import { Orchestrator } from './orchestrator.js';

dotenv.config();

const program = new Command();

program
    .name('ai-architect')
    .description('AI Architect CLI')
    .version('1.0.0');

program
    .option('--prompt <prompt>', 'A "fuzzy" AI-driven prompt.')
    .option('--publish', 'Run a production deployment.')
    .option('--preview', 'Run a preview deployment.');

program.parse(process.argv);

const options = program.opts();
const orchestrator = new Orchestrator(process.argv);

if (options.prompt) {
    orchestrator.runAiWorkflow(options.prompt);
} else if (options.publish) {
    orchestrator.runDeterministicWorkflow('publish');
} else if (options.preview) {
    orchestrator.runDeterministicWorkflow('preview');
} else {
    // Interactive mode or help
    if (process.argv.length <= 2) {
        console.log("Entering interactive mode. Type 'exit' to quit.");
        const readline = await import('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: 'ai-architect> '
        });

        rl.prompt();

        rl.on('line', (line) => {
            const prompt = line.trim();
            if (prompt.toLowerCase() === 'exit') {
                rl.close();
                return;
            }
            if (prompt) {
                orchestrator.runAiWorkflow(prompt);
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
