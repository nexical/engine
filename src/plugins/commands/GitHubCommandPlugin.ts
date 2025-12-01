import { BasePlugin, CommandPlugin } from '../../models/Plugins.js';
import path from 'path';

export class GitHubCommandPlugin extends BasePlugin implements CommandPlugin {
    name = 'github';
    description = 'Configure GitHub credentials. Usage: /github <organization> <api key>';

    async execute(args: string[]): Promise<void> {
        if (!args || args.length < 2) {
            console.error('Usage: /github <organization> <api key>');
            return;
        }

        const org = args[0];
        const apiKey = args[1];
        const envPath = path.join(this.core.config.projectPath, '.nexical', '.env');

        let envContent = '';
        if (this.core.disk.exists(envPath)) {
            envContent = await this.core.disk.readFile(envPath);
        }

        const envLines = envContent.split('\n');
        const newEnvLines: string[] = [];
        const keys = ['GITHUB_ORG', 'GITHUB_API_KEY'];
        const values = { 'GITHUB_ORG': org, 'GITHUB_API_KEY': apiKey };
        const found = { 'GITHUB_ORG': false, 'GITHUB_API_KEY': false };

        for (const line of envLines) {
            let updated = false;
            for (const key of keys) {
                if (line.startsWith(`${key}=`)) {
                    newEnvLines.push(`${key}=${values[key as keyof typeof values]}`);
                    found[key as keyof typeof found] = true;
                    updated = true;
                    break;
                }
            }
            if (!updated) {
                newEnvLines.push(line);
            }
        }

        for (const key of keys) {
            if (!found[key as keyof typeof found]) {
                newEnvLines.push(`${key}=${values[key as keyof typeof values]}`);
            }
        }

        await this.core.disk.writeFile(envPath, newEnvLines.join('\n'));

        console.log('GitHub configuration updated.');
    }
}
