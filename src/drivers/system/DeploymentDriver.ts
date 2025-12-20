import { BaseDriver, Driver, Skills } from '../../models/Driver.js';
import { Skill } from '../../models/Skill.js';

export class DeploymentDriver extends BaseDriver {
    name = 'deploy_site';
    description = 'Merge a branch into main and trigger deployment. Input: branchName (optional, defaults to current)';

    isSupported(skills: Skills): boolean {
        return true;
    }

    async execute(skill: Skill, taskPrompt: string, context?: any): Promise<string> {
        const teamId = this.core.session.context?.teamId;
        const projectId = context?.projectId || this.core.session.context?.projectId;

        let branchName = context?.branchName;
        if (!branchName) {
            // Try to deduce branch from prompt or current git status? 
            // For safety, require explicit branch or assume current if we can get it.
            // But GitService wrapping might not expose current branch easily without a command.
            // Let's rely on argument.
            // Or parse from taskPrompt? 
            // Simplifying: Assume Planner passes branchName in context or we fail.
            return "Error: branchName is required for deployment.";
        }

        if (!projectId) {
            return "Error: projectId is required for deployment.";
        }

        try {
            if (!teamId) {
                return "Error: teamId is required (must be in session context).";
            }

            this.core.host.log('info', `Fetching project details for Project ID: ${projectId}...`);

            // Refactor: We expect project details to be passed in context or retrieved via other means as IdentityManager is removed.
            // For now, valid project details must be in the context.
            const project = context?.project || this.core.session.context?.project; // TODO: Define Project interface

            if (!project) {
                return `Error: Project details for ${projectId} not found in context.`;
            }

            this.core.host.log('info', `Publishing branch '${branchName}' for project '${project.name}'...`);

            this.core.host.log('info', `Switching to main branch...`);
            await this.core.git.checkout('main');

            this.core.host.log('info', `Pulling latest changes from origin/main...`);
            await this.core.git.pull('origin', 'main');

            this.core.host.log('info', `Merging branch ${branchName} into main...`);
            await this.core.git.merge(branchName);

            this.core.host.log('info', `Pushing main to origin...`);
            await this.core.git.push('origin', 'main');

            return `Success: Successfully published ${branchName} to main.`;

        } catch (error: any) {
            const msg = `Failed to publish branch ${branchName}: ${error.message}`;
            this.core.host.log('error', msg);
            throw error;
        }
    }
}
