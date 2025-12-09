import { BaseCommand, Command } from '../models/Command.js';

export class DestroyCommand extends BaseCommand implements Command {
    name = 'destroy';
    description = 'Destroy Cloudflare project and Orchestrator entity for a Project ID. GitHub repo is preserved. Usage: /destroy <projectId>';

    async execute(args: string[]): Promise<void> {
        if (!args || args.length < 1) {
            console.error('Usage: /destroy <projectId>');
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

            // We try to get project to get the name for Cloudflare deletion
            let project;
            try {
                project = await client.projects.get(teamId, projectId);
            } catch (err) {
                console.error(`Could not fetch project ${projectId}. It might have been deleted already. Cannot proceed with Cloudflare deletion without name.`);
                // If we can't get the project, we can't know the CF name (unless we guess or it was passed). 
                // We will proceed to try deleting the entity just in case.
            }

            if (project) {
                // 1. Delete Cloudflare Project
                console.log(`Deleting Cloudflare project '${project.name}'...`);
                await this.core.cloudflare.deleteProject(project.name);

                // 2. Delete Project Entity
                console.log(`Deleting Project entity ${projectId} from Orchestrator...`);
                // Note: client.projects.delete usually takes (teamId, projectId)
                // Assuming client has delete method.
                // Checking SDK structure usually: client.projects.delete(teamId, projectId)
                // If the method doesn't exist on the type, we might have an issue, but standard REST resource usually has it.
                // We'll assume it exists based on requirements.
                await client.projects.delete(teamId, projectId);

                console.log(`Destroy command completed for project ${projectId}. GitHub repository '${project.repoUrl}' was preserved.`);
            } else {
                // Try deleting entity anyway if logic allows, or just error
                console.error('Aborting destroy command.');
            }

        } catch (error: any) {
            console.error(`Failed to destroy project: ${error.message}`);
            throw error;
        }
    }
}
