import { BaseCommand, Command } from '../models/Command.js';

export class CreateCommand extends BaseCommand implements Command {
    name = 'create';
    description = 'Provision a GitHub repository and Cloudflare project for a Project ID. Usage: /create <projectId>';

    async execute(args: string[]): Promise<void> {
        if (!args || args.length < 1) {
            console.error('Usage: /create <projectId>');
            return;
        }

        const projectId = parseInt(args[0], 10);
        if (isNaN(projectId)) {
            console.error('Project ID must be a number.');
            return;
        }

        try {
            const teamId = this.core.jobContext?.teamId;
            if (!teamId) {
                console.error('Team ID not found in job context.');
                return;
            }

            console.log(`Fetching project details for Project ID: ${projectId}...`);
            const client = this.core.identityManager?.getClient();
            if (!client) {
                console.error('Nexical Client not available.');
                return;
            }

            const project = await client.projects.get(teamId, projectId);
            if (!project) {
                console.error(`Project ${projectId} not found.`);
                return;
            }

            console.log(`Processing Project '${project.name}' (Repo: ${project.repoUrl})...`);

            // 1. Ensure GitHub Repo Exists
            let repoName = project.name; // Default fallback
            let owner = '';

            // Extract from repoUrl if available
            if (project.repoUrl) {
                const githubRegex = /github\.com[:\/]([^\/]+)\/([^\/\.]+)/;
                const match = project.repoUrl.match(githubRegex);
                if (match) {
                    owner = match[1];
                    repoName = match[2];
                }
            }

            // If we have an owner, we can check. For now, assuming standard org/user context if checking fails?
            // Actually GitHubService can check specific owner/repo check.
            if (owner && repoName) {
                console.log(`Checking GitHub repository ${owner}/${repoName}...`);
                const existingRepo = await this.core.github?.getRepo(owner, repoName);
                if (!existingRepo) {
                    console.log(`Repository does not exist. Creating ${repoName}...`);
                    // We don't have org in project entity usually, unless owner IS the org.
                    // Assuming owner is the target org or user.
                    // But GitHubService.createRepo takes (name, org?).
                    // If owner is different from authenticated user, we might assume it's an org.
                    await this.core.github?.createRepo(repoName, owner !== (await this.core.github.getUser()).login ? owner : undefined);
                } else {
                    console.log(`Repository ${owner}/${repoName} already exists.`);
                }
            } else {
                console.log(`Could not parse GitHub details from URL ${project.repoUrl}. Skipping GitHub creation check.`);
            }

            // 2. Ensure Cloudflare Project Exists
            console.log(`Ensuring Cloudflare project '${project.name}' exists...`);
            if (project.repoUrl) {
                await this.core.cloudflare.ensureProjectExists(project.name, project.repoUrl);
            } else {
                console.error('Project repoUrl is missing. Cannot ensure Cloudflare project exists.');
            }

            // 3. Link Domain if present
            if ((project as any).domain) {
                console.log(`Linking domain '${(project as any).domain}' to Cloudflare project...`);
                await this.core.cloudflare.addDomain(project.name, (project as any).domain);
            }

            console.log(`Project ${project.id} (${project.name}) provisioning complete.`);

        } catch (error: any) {
            console.error(`Failed to create project resources: ${error.message}`);
            throw error;
        }
    }
}
