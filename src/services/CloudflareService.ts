import { spawnSync } from 'child_process';

export class CloudflareService {
    constructor(
        private apiToken: string,
        private accountId: string
    ) { }

    async deploy(projectName: string, directory: string = '.', branch?: string): Promise<string> {
        const args = ['pages', 'deploy', directory, '--project-name', projectName];

        if (branch) {
            args.push('--branch', branch);
        }

        const command = 'npx';
        const commandArgs = ['wrangler', ...args];

        console.log(`Running Cloudflare deployment: ${command} ${commandArgs.join(' ')}`);

        const env = { ...process.env, CLOUDFLARE_API_TOKEN: this.apiToken, CLOUDFLARE_ACCOUNT_ID: this.accountId };

        const result = spawnSync(command, commandArgs, {
            env,
            encoding: 'utf-8',
            stdio: 'inherit'
        });

        if (result.status !== 0) {
            throw new Error(`Cloudflare deployment failed with exit code ${result.status}`);
        }

        return "Deployment successful";
    }

    async linkDomain(projectName: string, domain: string): Promise<void> {
        console.log(`Linking domain ${domain} to project ${projectName}...`);

        const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/pages/projects/${projectName}/domains`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: domain
                })
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`Failed to link domain: ${response.status} ${response.statusText} - ${errorBody}`);
            }

            const data = await response.json();
            if (!data.success) {
                throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
            }

            console.log(`Successfully linked domain ${domain}`);
        } catch (error) {
            console.error(`Error linking domain ${domain}:`, error);
            throw error;
        }
    }
}

