import { BasePlugin, CommandPlugin } from '../../models/Plugins.js';
import path from 'path';

export class CloudflareCommandPlugin extends BasePlugin implements CommandPlugin {
    name = 'cloudflare';
    description = 'Configure Cloudflare credentials. Usage: /cloudflare <account id> <api key>';

    async execute(args: string[]): Promise<void> {
        if (!args || args.length < 2) {
            console.error('Usage: /cloudflare <account id> <api key>');
            return;
        }

        const accountId = args[0];
        const apiToken = args[1];
        const envPath = path.join(this.core.config.projectPath, '.nexical', '.env');

        let envContent = '';
        if (this.core.disk.exists(envPath)) {
            envContent = await this.core.disk.readFile(envPath);
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

        await this.core.disk.writeFile(envPath, newEnvLines.join('\n'));

        console.log('Cloudflare configuration updated.');
    }
}
