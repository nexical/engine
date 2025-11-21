import { spawnSync } from 'child_process';

export class CloudflareService {
    constructor(
        private apiToken: string,
        private accountId: string
    ) { }

    deploy(projectName: string, directory: string = '.', branch?: string): string {
        const args = ['pages', 'deploy', directory, '--project-name', projectName];

        if (branch) {
            args.push('--branch', branch);
        }

        // We assume wrangler is installed and available in the environment or via npx
        // Using npx to ensure we use the local or installed version
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
}
