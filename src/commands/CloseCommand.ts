import { BaseCommand, Command } from '../models/Command.js';

export class CloseCommand extends BaseCommand implements Command {
    name = 'close';
    description = 'Close a job branch (delete local and remote). Usage: /close <projectId> <branch name>';

    async execute(args: string[]): Promise<void> {
        if (!args || args.length < 2) {
            console.error('Usage: /close <projectId> <branch name>');
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
            console.log(`Closing branch '${branchName}' for project '${project.name}'...`);

            console.log(`Switching to main branch...`);
            this.core.git.checkout('main');

            console.log(`Deleting local branch ${branchName}...`);
            this.core.git.deleteBranch(branchName, true);

            console.log(`Deleting remote branch ${branchName} from origin...`);
            this.core.git.pushDelete('origin', branchName);

            console.log(`Successfully closed ${branchName}. Preview deployment should be cleaned up automatically.`);
        } catch (error: any) {
            console.error(`Failed to close branch ${branchName}: ${error.message}`);
            throw error;
        }
    }
}
