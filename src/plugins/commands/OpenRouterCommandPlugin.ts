import { BasePlugin } from '../../models/Plugins.js';
import { Orchestrator } from '../../orchestrator.js';
import { FileSystemService } from '../../services/FileSystemService.js';
import path from 'path';

export class OpenRouterCommandPlugin extends BasePlugin {
    private fs: FileSystemService;

    constructor(protected core: Orchestrator) {
        super(core);
        this.fs = new FileSystemService();
    }

    getName(): string {
        return 'openrouter';
    }

    async execute(args: string[]): Promise<string> {
        if (args.length < 1) {
            throw new Error('Usage: /openrouter <api key>');
        }

        const apiKey = args[0];
        const envPath = path.join(this.core.config.projectPath, '.plotris', '.env');

        let envContent = '';
        if (this.fs.exists(envPath)) {
            envContent = await this.fs.readFile(envPath);
        }

        // Parse existing env vars
        const envLines = envContent.split('\n');
        const newEnvLines: string[] = [];
        let found = false;

        for (const line of envLines) {
            if (line.startsWith('OPENROUTER_API_KEY=')) {
                newEnvLines.push(`OPENROUTER_API_KEY=${apiKey}`);
                found = true;
            } else {
                newEnvLines.push(line);
            }
        }

        if (!found) {
            newEnvLines.push(`OPENROUTER_API_KEY=${apiKey}`);
        }

        await this.fs.writeFile(envPath, newEnvLines.join('\n'));

        return 'OpenRouter API key configured.';
    }
}
