import { NexicalClient } from '@nexical/sdk';
import debug from 'debug';

const log = debug('identity-manager');

export class IdentityManager {
    constructor(private client: NexicalClient) { }

    getClient(): NexicalClient {
        return this.client;
    }

    async getGitToken(teamId: number, projectId: number, jobId: number, mode: 'managed' | 'self_hosted'): Promise<string> {
        if (mode === 'self_hosted') {
            log('Using self-hosted git token from environment');
            return process.env.GIT_TOKEN || process.env.GITHUB_TOKEN || '';
        }

        log(`Fetching managed git token for job ${jobId}`);
        const response = await this.client.jobs.getGitToken(teamId, projectId, jobId);
        return response.token;
    }

    async getAgentToken(teamId: number, projectId: number, jobId: number): Promise<string> {
        log(`Fetching agent token for job ${jobId}`);
        const response = await this.client.jobs.getAgentToken(teamId, projectId, jobId);
        return response.token;
    }
}
