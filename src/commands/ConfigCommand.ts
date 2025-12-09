import { BaseCommand, Command } from '../models/Command.js';
import path from 'path';
import yaml from 'js-yaml';

export class ConfigCommand extends BaseCommand implements Command {
    name = 'config';
    description = 'Get or set configuration values. Usage: /config [key] [value]';

    async execute(args: string[]): Promise<void> {
        const configPath = path.join(this.core.config.projectPath, '.nexical', 'config.yml');

        if (!this.core.disk.exists(configPath)) {
            console.error('Configuration file not found. Run /init first.');
            return;
        }

        const configContent = await this.core.disk.readFile(configPath);
        const config: any = yaml.load(configContent) || {};

        if (!args || args.length === 0) {
            // Return all config
            console.log(yaml.dump(config));
            return;
        }

        const key = args[0];
        const value = args[1];

        if (args.length === 1) {
            // Get value
            console.log(config[key] !== undefined ? String(config[key]) : 'undefined');
            return;
        }

        // Set value
        config[key] = value;
        await this.core.disk.writeFile(configPath, yaml.dump(config));
        console.log(`Set ${key} to ${value}`);
    }
}
