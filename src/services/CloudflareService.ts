import { spawnSync } from 'child_process';
import { AppConfig } from '../data_models/AppConfig.js';

export class CloudflareService {
    private apiToken: string | undefined;
    private accountId: string | undefined;

    constructor(private config: AppConfig) {
        this.apiToken = process.env.CLOUDFLARE_API_TOKEN;
        this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

        if (!this.apiToken || !this.accountId) {
            throw new Error("Cloudflare API token and Account ID must be set as environment variables for deployment.");
        }
    }

    async createProject(projectName: string): Promise<void> {
        console.log(`Creating Cloudflare Pages project: ${projectName}...`);
        const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/pages/projects`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: projectName,
                    production_branch: 'main'
                })
            });

            if (!response.ok) {
                const errorBody = await response.text();
                // If conflict (already exists), we can ignore, but better to check first or handle 409
                if (response.status === 409) {
                    console.log(`Project ${projectName} already exists.`);
                    return;
                }
                throw new Error(`Failed to create project: ${response.status} ${response.statusText} - ${errorBody}`);
            }

            const data = await response.json();
            if (!data.success) {
                throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
            }

            console.log(`Successfully created project ${projectName}`);
        } catch (error) {
            console.error(`Error creating project ${projectName}:`, error);
            throw error;
        }
    }

    async ensureProjectExists(projectName: string): Promise<void> {
        // We can try to create it, and catch 409, or check existence. 
        // Trying to create is atomic and simpler.
        await this.createProject(projectName);
    }

    async deploy(projectName: string, directory: string = '.', branch?: string): Promise<string> {
        await this.ensureProjectExists(projectName);

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

