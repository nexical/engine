import { NexicalClient } from '@nexical/sdk';
import debug from 'debug';

const log = debug('job-service');

export class JobService {
    constructor(private client: NexicalClient) { }

    async streamLog(job: { id: number, teamId: number, projectId: number }, message: string, level: 'info' | 'error' | 'warn' | 'debug' = 'info'): Promise<void> {
        try {
            await this.client.jobs.addLog(job.teamId, job.projectId, job.id, {
                message,
                level: level as any, // Cast to match SDK if needed
            });
        } catch (error) {
            log(`Failed to stream log for job ${job.id}:`, error);
        }
    }
}
