import { BaseCommand, Command } from '../models/Command.js';

export class HelpCommand extends BaseCommand implements Command {
    name = 'help';
    description = 'List all available commands. Usage: /help';

    async execute(args?: string[]): Promise<void> {
        console.log('Available Commands:');
        const commands = this.core.commandRegistry.getAll();
        for (const cmd of commands) {
            console.log(`  /${cmd.name} - ${cmd.description}`);
        }
    }
}
