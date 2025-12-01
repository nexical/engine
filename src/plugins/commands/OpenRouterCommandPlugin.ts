import { BasePlugin, CommandPlugin } from '../../models/Plugins.js';
import path from 'path';

export class OpenRouterCommandPlugin extends BasePlugin implements CommandPlugin {
    name = 'openrouter';
    description = 'Configure OpenRouter API key. Usage: /openrouter <api key>';

    async execute(args: string[]): Promise<void> {
        if (!args || args.length < 1) {
            console.error('Usage: /openrouter <api key>');
            return;
        }

        const apiKey = args[0];
        const envPath = path.join(this.core.config.projectPath, '.nexical', '.env');

        let envContent = '';
        if (this.core.disk.exists(envPath)) {
            envContent = await this.core.disk.readFile(envPath);
        }

        // Parse existing env vars
        const envLines = envContent.split('\n').filter(line => line.trim() !== '');
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

        await this.core.disk.writeFile(envPath, newEnvLines.join('\n'));

        console.log('OpenRouter API key configured.');
    }
}
