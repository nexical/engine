import { CommandPlugin, BasePlugin } from '../../models/Plugins.js';

export class HelpCommandPlugin extends BasePlugin implements CommandPlugin {
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
