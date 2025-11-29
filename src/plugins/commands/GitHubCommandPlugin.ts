import { BasePlugin } from '../../models/Plugins.js';
import { Orchestrator } from '../../orchestrator.js';
import { FileSystemService } from '../../services/FileSystemService.js';
import path from 'path';

export class GitHubCommandPlugin extends BasePlugin {
    private fs: FileSystemService;

    constructor(protected core: Orchestrator) {
        super(core);
        this.fs = new FileSystemService();
    }

    getName(): string {
        return 'github';
    }

    async execute(args: string[]): Promise<string> {
        if (args.length < 2) {
            throw new Error('Usage: /github <organization> <api key>');
        }

        const org = args[0];
        const apiKey = args[1];
        const envPath = path.join(this.core.config.projectPath, '.plotris', '.env');

        let envContent = '';
        if (this.fs.exists(envPath)) {
            envContent = await this.fs.readFile(envPath);
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

        await this.fs.writeFile(envPath, newEnvLines.join('\n'));

        return 'GitHub configuration updated.';
    }
}
