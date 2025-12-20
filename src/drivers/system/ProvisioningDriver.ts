import { BaseDriver, Driver, Skills } from '../../models/Driver.js';
import { Skill } from '../../models/Skill.js';

export class ProvisioningDriver extends BaseDriver {
    name = 'provision_resources';
    description = 'Provision a GitHub repository and Cloudflare project for a Project ID. Required context: projectId';

    isSupported(skills: Skills): boolean {
        return true; // No special binaries required, just API access
    }

    async execute(skill: Skill, taskPrompt: string, context?: any): Promise<string> {
        // Context might be passed directly or found in session
        const projectId = context?.projectId || this.core.session.context?.projectId;
        const teamId = this.core.session.context?.teamId;

        if (!projectId) {
            return "Error: projectId is required for provisioning.";
        }
        if (!teamId) {
            return "Error: teamId is required (must be in session context).";
        }

        try {
            this.core.host.log('info', `Fetching project details for Project ID: ${projectId}...`);
            this.core.host.log('info', `Fetching project details for Project ID: ${projectId}...`);

            // Refactor: We expect project details to be passed in context or retrieved via other means as IdentityManager is removed.
            // For now, valid project details must be in the context.
            const project = context?.project || this.core.session.context?.project;

            if (!project) {
                return `Error: Project details for ${projectId} not found in context.`;
            }

            this.core.host.log('info', `Processing Project '${project.name}' (Repo: ${project.repoUrl})...`);

            // 1. Ensure GitHub Repo Exists
            let repoName = project.name;
            let owner = '';

            if (project.repoUrl) {
                const githubRegex = /github\.com[:\/]([^\/]+)\/([^\/\.]+)/;
                const match = project.repoUrl.match(githubRegex);
                if (match) {
                    owner = match[1];
                    repoName = match[2];
                }
            }

            if (owner && repoName) {
                this.core.host.log('info', `Checking GitHub repository ${owner}/${repoName}...`);
                const existingRepo = await this.core.github?.getRepo(owner, repoName);
                if (!existingRepo) {
                    this.core.host.log('info', `Repository does not exist. Creating ${repoName}...`);
                    await this.core.github?.createRepo(repoName, owner !== (await this.core.github.getUser()).login ? owner : undefined);
                } else {
                    this.core.host.log('info', `Repository ${owner}/${repoName} already exists.`);
                }
            } else {
                this.core.host.log('warn', `Could not parse GitHub details from URL ${project.repoUrl}. Skipping GitHub creation check.`);
            }

            // 2. Ensure Cloudflare Project Exists
            this.core.host.log('info', `Ensuring Cloudflare project '${project.name}' exists...`);
            if (project.repoUrl) {
                await this.core.cloudflare.ensureProjectExists(project.name, project.repoUrl);
            } else {
                return 'Error: Project repoUrl is missing. Cannot ensure Cloudflare project exists.';
            }

            // 3. Link Domain if present
            if ((project as any).domain) {
                this.core.host.log('info', `Linking domain '${(project as any).domain}' to Cloudflare project...`);
                await this.core.cloudflare.addDomain(project.name, (project as any).domain);
            }

            return `Success: Project ${project.id} (${project.name}) provisioning complete.`;

        } catch (error: any) {
            const msg = `Failed to create project resources: ${error.message}`;
            this.core.host.log('error', msg);
            throw error;
        }
    }
}
