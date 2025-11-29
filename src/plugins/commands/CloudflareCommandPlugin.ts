import { BasePlugin } from '../../models/Plugins.js';
import { Orchestrator } from '../../orchestrator.js';
import { FileSystemService } from '../../services/FileSystemService.js';
import path from 'path';

export class CloudflareCommandPlugin extends BasePlugin {
    private fs: FileSystemService;

    constructor(protected core: Orchestrator) {
        super(core);
        this.fs = new FileSystemService();
    }

    getName(): string {
        return 'cloudflare';
    }

    async execute(args: string[]): Promise<string> {
        if (args.length < 2) {
            throw new Error('Usage: /cloudflare <account id> <api key>');
        }

        const accountId = args[0];
        const apiToken = args[1];
        const envPath = path.join(this.core.config.projectPath, '.plotris', '.env');

        let envContent = '';
        if (this.fs.exists(envPath)) {
            envContent = await this.fs.readFile(envPath);
        }

        const envLines = envContent.split('\n');
        const newEnvLines: string[] = [];
        const keys = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'];
        const values = { 'CLOUDFLARE_ACCOUNT_ID': accountId, 'CLOUDFLARE_API_TOKEN': apiToken };
        const found = { 'CLOUDFLARE_ACCOUNT_ID': false, 'CLOUDFLARE_API_TOKEN': false };

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

        return 'Cloudflare configuration updated.';
    }
}
