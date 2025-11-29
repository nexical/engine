import debug from 'debug';
import { spawnSync } from 'child_process';
import { Orchestrator } from '../orchestrator.js';

const log = debug('cloudflare');

export class CloudflareService {
    private apiToken: string | undefined;
    private accountId: string | undefined;

    constructor(private core: Orchestrator) {
        this.apiToken = process.env.CLOUDFLARE_API_TOKEN;
        this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

        if (!this.apiToken || !this.accountId) {
            throw new Error("Cloudflare API token and Account ID must be set as environment variables for deployment.");
        }
    }

    async createProject(projectName: string, source?: { type: 'github', owner: string, repo: string }): Promise<void> {
        log(`Creating Cloudflare Pages project: ${projectName}...`);
        const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/pages/projects`;

        const body: any = {
            name: projectName,
            production_branch: 'main'
        };

        if (source && source.type === 'github') {
            body.source = {
                type: 'github',
                config: {
                    owner: source.owner,
                    repo_name: source.repo,
                    production_branch: 'main',
                    pr_comments_enabled: true,
                    deployments_enabled: true
                }
            };
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorBody = await response.text();
                // If conflict (already exists), we can ignore, but better to check first or handle 409
                if (response.status === 409) {
                    log(`Project ${projectName} already exists.`);
                    return;
                }
                throw new Error(`Failed to create project: ${response.status} ${response.statusText} - ${errorBody}`);
            }

            const data = await response.json();
            if (!data.success) {
                throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
            }

            log(`Successfully created project ${projectName}`);
        } catch (error) {
            console.error(`Error creating project ${projectName}:`, error);
            throw error;
        }
    }

    async ensureProjectExists(projectName: string, source?: { type: 'github', owner: string, repo: string }): Promise<void> {
        // We can try to create it, and catch 409, or check existence. 
        // Trying to create is atomic and simpler.
        await this.createProject(projectName, source);
    }

    async deploy(projectName: string, directory: string = '.', branch?: string): Promise<string> {
        await this.ensureProjectExists(projectName);

        const args = ['pages', 'deploy', directory, '--project-name', projectName];

        if (branch) {
            args.push('--branch', branch);
        }

        const command = 'npx';
        const commandArgs = ['wrangler', ...args];

        log(`Running Cloudflare deployment: ${command} ${commandArgs.join(' ')}`);

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
        log(`Linking domain ${domain} to project ${projectName}...`);

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

            log(`Successfully linked domain ${domain}`);
        } catch (error) {
            console.error(`Error linking domain ${domain}:`, error);
            throw error;
        }
    }
}

