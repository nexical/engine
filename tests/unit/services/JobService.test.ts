import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { JobService } from '../../../src/services/JobService.js';
import { NexicalClient } from '@nexical/sdk';

jest.mock('@nexical/sdk');

describe('JobService', () => {
    let jobService: JobService;
    let mockClient: jest.Mocked<NexicalClient>;
    let mockJobsResource: any;

    beforeEach(() => {
        mockJobsResource = {
            addLog: jest.fn(),
        };
        mockClient = new NexicalClient({}) as jest.Mocked<NexicalClient>;
        mockClient.jobs = mockJobsResource;

        jobService = new JobService(mockClient);
    });

    describe('streamLog', () => {
        it('should call client.jobs.addLog', async () => {
            await jobService.streamLog({ id: 1, teamId: 2, projectId: 3 }, 'test message', 'info');
            expect(mockJobsResource.addLog).toHaveBeenCalledWith(2, 3, 1, {
                message: 'test message',
                level: 'info',
            });
        });

        it('should default level to info', async () => {
            await jobService.streamLog({ id: 1, teamId: 2, projectId: 3 }, 'test message');
            expect(mockJobsResource.addLog).toHaveBeenCalledWith(2, 3, 1, {
                message: 'test message',
                level: 'info',
            });
        });

        it('should handle errors gracefully', async () => {
            mockJobsResource.addLog.mockRejectedValue(new Error('Network error'));
            const logSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
            // Or typically checking if it throws. It shouldn't, according to code.

            await expect(jobService.streamLog({ id: 1, teamId: 2, projectId: 3 }, 'test message'))
                .resolves.not.toThrow();

            // Depending on debug usage, it might log to stderr or not visible in jest mock unless debug is enabled.
            // But main point is it doesn't throw.
            logSpy.mockRestore();
        });
    });
});
