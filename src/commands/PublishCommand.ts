import { BaseCommand, Command } from '../models/Command.js';

export class PublishCommand extends BaseCommand implements Command {
    name = 'publish';
    description = 'Merge a job branch into main. Usage: /publish <projectId> <branch name>';

    async execute(args: string[]): Promise<void> {
        if (!args || args.length < 2) {
            console.error('Usage: /publish <projectId> <branch name>');
            return;
        }

        const projectId = parseInt(args[0], 10);
        const branchName = args[1];

        if (isNaN(projectId)) {
            console.error('Project ID must be a number.');
            return;
        }

        try {
            // Access teamId from jobContext
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
            console.log(`Publishing branch '${branchName}' for project '${project.name}'...`);

            console.log(`Switching to main branch...`);
            this.core.git.checkout('main');

            console.log(`Pulling latest changes from origin/main...`);
            this.core.git.pull('origin', 'main');

            console.log(`Merging branch ${branchName} into main...`);
            this.core.git.merge(branchName);

            console.log(`Pushing main to origin...`);
            this.core.git.push('origin', 'main');

            console.log(`Successfully published ${branchName} to main.`);
        } catch (error: any) {
            console.error(`Failed to publish branch ${branchName}: ${error.message}`);
            throw error;
        }
    }
}
