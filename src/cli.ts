#!/usr/bin/env node
import { Command } from 'commander';
import dotenv from 'dotenv';
import debug from 'debug';
import { Orchestrator } from './orchestrator.js';

dotenv.config({ quiet: true });

const log = debug('cli');
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
try {
    const orchestrator = new Orchestrator(process.argv);
    await orchestrator.init();

    if (options.prompt) {
        await orchestrator.runAIWorkflow(options.prompt);
    } else if (options.publish) {
        // await orchestrator.runProductionDeployment();
    } else if (options.preview) {
        // await orchestrator.runPreviewDeployment();
    } else {
        // Interactive mode or help
        if (process.argv.length <= 2) {
            console.log("Entering interactive mode. Type 'exit' to quit.");
            const readline = await import('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
                prompt: 'builder> '
            });

            rl.prompt();
            rl.on('line', async (line) => {
                const prompt = line.trim();
                if (prompt.toLowerCase() === 'exit') {
                    rl.close();
                    return;
                }
                if (prompt) {
                    await orchestrator.runAIWorkflow(prompt);
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
