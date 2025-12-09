import debug from 'debug';

const log = debug('cloudflare-service');

export class CloudflareService {
    private accountId: string;
    private apiToken: string;

    constructor() {
        this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
        this.apiToken = process.env.CLOUDFLARE_API_TOKEN || '';
    }

    async ensureProjectExists(projectName: string, repoUrl: string): Promise<boolean> {
        if (!this.accountId || !this.apiToken) {
            log('Cloudflare credentials missing (CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN). Skipping project sync.');
            return false;
        }

        log(`Ensuring Cloudflare project '${projectName}' exists...`);

        try {
            // Check if project exists
            const checkUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/pages/projects/${projectName}`;
            const response = await fetch(checkUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 200) {
                log(`Cloudflare project '${projectName}' already exists.`);
                return true;
            } else if (response.status === 404) {
                log(`Cloudflare project '${projectName}' not found. Creating...`);
                return await this.createProject(projectName, repoUrl);
            } else {
                const body = await response.text();
                log(`Failed to check Cloudflare project: ${response.status} ${response.statusText}`, body);
                return false;
            }
        } catch (error) {
            log('Error connecting to Cloudflare API:', error);
            return false;
        }
    }

    private async createProject(projectName: string, repoUrl: string): Promise<boolean> {
        // Parse GitHub owner/repo from URL
        let owner = '';
        let repo = '';

        // Support standard formats:
        // https://github.com/owner/repo
        // https://github.com/owner/repo.git
        // git@github.com:owner/repo.git
        const githubRegex = /github\.com[:\/]([^\/]+)\/([^\/\.]+)/;
        const match = repoUrl ? repoUrl.match(githubRegex) : null;

        if (match) {
            owner = match[1];
            repo = match[2];
        }

        const createUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/pages/projects`;

        let payload: any = {
            name: projectName,
            production_branch: "main"
        };

        if (owner && repo) {
            log(`Configuring project with GitHub source: ${owner}/${repo}`);
            payload.source = {
                type: "github",
                config: {
                    owner: owner,
                    repo_name: repo,
                    production_branch: "main",
                    pr_comments_enabled: true,
                    deployments_enabled: true
                }
            };
            payload.build_config = {
                build_command: "npm run build",
                destination_dir: "dist",
                root_dir: "" // Assumes root
            };
        } else {
            log('Could not parse GitHub repository from URL. Creating project without source configuration.');
        }

        try {
            const response = await fetch(createUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (response.status === 200 || response.status === 201) {
                const data = await response.json();
                const result = data as any;
                if (result.success) {
                    log(`Successfully created Cloudflare project '${projectName}'.`);
                    return true;
                } else {
                    log('Cloudflare API returned failure:', JSON.stringify(result.errors || result.messages));
                    return false;
                }
            } else {
                const body = await response.text();
                log(`Failed to create Cloudflare project: ${response.status} ${response.statusText}`, body);
                return false;
            }
        } catch (error) {
            log('Error creating Cloudflare project:', error);
            return false;
        }
    }
    async deleteProject(projectName: string): Promise<boolean> {
        if (!this.accountId || !this.apiToken) {
            log('Cloudflare credentials missing. Cannot delete project.');
            return false;
        }

        const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/pages/projects/${projectName}`;

        try {
            log(`Deleting Cloudflare project '${projectName}'...`);
            const response = await fetch(url, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                log(`Successfully deleted project '${projectName}'.`);
                return true;
            } else {
                const body = await response.text();
                log(`Failed to delete project '${projectName}': ${response.status} ${response.statusText}`, body);
                return false;
            }
        } catch (error) {
            log(`Error deleting project '${projectName}':`, error);
            return false;
        }
    }

    async addDomain(projectName: string, domain: string): Promise<boolean> {
        if (!this.accountId || !this.apiToken) {
            log('Cloudflare credentials missing. Cannot add domain.');
            return false;
        }

        const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/pages/projects/${projectName}/domains`;

        try {
            log(`Adding domain '${domain}' to project '${projectName}'...`);
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

            if (response.ok) {
                log(`Successfully added domain '${domain}'.`);
                return true;
            } else {
                const body = await response.text();
                log(`Failed to add domain '${domain}': ${response.status} ${response.statusText}`, body);
                return false;
            }
        } catch (error) {
            log(`Error adding domain '${domain}':`, error);
            return false;
        }
    }
}
