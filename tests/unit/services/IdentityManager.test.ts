import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { IdentityManager } from '../../../src/services/IdentityManager.js';
import { NexicalClient } from '@nexical/sdk';

jest.mock('@nexical/sdk');

describe('IdentityManager', () => {
    let identityManager: IdentityManager;
    let mockClient: jest.Mocked<NexicalClient>;
    let mockJobsResource: any;

    beforeEach(() => {
        mockJobsResource = {
            getGitToken: jest.fn(),
            getAgentToken: jest.fn(),
        };

        mockClient = new NexicalClient({}) as jest.Mocked<NexicalClient>;
        mockClient.jobs = mockJobsResource;

        identityManager = new IdentityManager(mockClient);
    });

    describe('getClient', () => {
        it('should return the client instance', () => {
            expect(identityManager.getClient()).toBe(mockClient);
        });
    });

    describe('getGitToken', () => {
        it('should return env var for self_hosted mode', async () => {
            process.env.GIT_TOKEN = 'env-git-token';
            const token = await identityManager.getGitToken(1, 1, 1, 'self_hosted');
            expect(token).toBe('env-git-token');
            delete process.env.GIT_TOKEN;
        });

        it('should fallback to GITHUB_TOKEN for self_hosted mode', async () => {
            process.env.GITHUB_TOKEN = 'env-github-token';
            const token = await identityManager.getGitToken(1, 1, 1, 'self_hosted');
            expect(token).toBe('env-github-token');
            delete process.env.GITHUB_TOKEN;
        });

        it('should return empty string if no env var for self_hosted mode', async () => {
            delete process.env.GIT_TOKEN;
            delete process.env.GITHUB_TOKEN;
            const token = await identityManager.getGitToken(1, 1, 1, 'self_hosted');
            expect(token).toBe('');
        });

        it('should fetch from client for managed mode', async () => {
            mockJobsResource.getGitToken.mockResolvedValue({ token: 'managed-token' });
            const token = await identityManager.getGitToken(1, 2, 3, 'managed');
            expect(token).toBe('managed-token');
            expect(mockJobsResource.getGitToken).toHaveBeenCalledWith(1, 2, 3);
        });
    });

    describe('getAgentToken', () => {
        it('should fetch from client', async () => {
            mockJobsResource.getAgentToken.mockResolvedValue({ token: 'agent-token' });
            const token = await identityManager.getAgentToken(1, 2, 3);
            expect(token).toBe('agent-token');
            expect(mockJobsResource.getAgentToken).toHaveBeenCalledWith(1, 2, 3);
        });
    });
});
