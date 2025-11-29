import { BasePlugin } from '../../models/Plugins.js';
import { Orchestrator } from '../../orchestrator.js';
import { FileSystemService } from '../../services/FileSystemService.js';
import path from 'path';
import yaml from 'js-yaml';

export class ConfigCommandPlugin extends BasePlugin {
    private fs: FileSystemService;

    constructor(protected core: Orchestrator) {
        super(core);
        this.fs = new FileSystemService();
    }

    getName(): string {
        return 'config';
    }

    async execute(args: string[]): Promise<string> {
        const configPath = path.join(this.core.config.projectPath, '.plotris', 'config.yml');

        if (!this.fs.exists(configPath)) {
            throw new Error('Configuration file not found. Run /init first.');
        }

        const configContent = await this.fs.readFile(configPath);
        const config: any = yaml.load(configContent) || {};

        if (args.length === 0) {
            // Return all config
            return yaml.dump(config);
        }

        const key = args[0];
        const value = args[1];

        if (args.length === 1) {
            // Get value
            return config[key] !== undefined ? String(config[key]) : 'undefined';
        }

        // Set value
        config[key] = value;
        await this.fs.writeFile(configPath, yaml.dump(config));
        return `Set ${key} to ${value}`;
    }
}
