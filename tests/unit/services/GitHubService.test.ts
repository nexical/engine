import { jest, expect, describe, it, beforeEach, afterEach } from '@jest/globals';
import { GitHubService } from '../../../src/services/GitHubService.js';

describe('GitHubService', () => {
    let service: GitHubService;
    let mockOrchestrator: any;
    let originalFetch: any;

    beforeEach(() => {
        mockOrchestrator = {
            config: {}
        };
        service = new GitHubService(mockOrchestrator);
        originalFetch = global.fetch;
        global.fetch = jest.fn<any>();
        process.env.GITHUB_API_KEY = 'test-key';
    });

    afterEach(() => {
        global.fetch = originalFetch;
        delete process.env.GITHUB_API_KEY;
    });

    it('should throw if API key is missing', () => {
        delete process.env.GITHUB_API_KEY;
        expect(() => service['getHeaders']()).toThrow('GitHub API key is not configured');
    });

    it('should get user info', async () => {
        (global.fetch as jest.Mock<any>).mockResolvedValue({
            ok: true,
            json: async () => ({ login: 'testuser' })
        });

        const user = await service.getUser();
        expect(user).toEqual({ login: 'testuser' });
        expect(global.fetch).toHaveBeenCalledWith('https://api.github.com/user', expect.any(Object));
    });

    it('should handle get user error', async () => {
        (global.fetch as jest.Mock<any>).mockResolvedValue({
            ok: false,
            status: 401,
            statusText: 'Unauthorized'
        });

        await expect(service.getUser()).rejects.toThrow('Failed to get user: 401 Unauthorized');
    });

    it('should get repo info', async () => {
        (global.fetch as jest.Mock<any>).mockResolvedValue({
            ok: true,
            json: async () => ({ name: 'repo' })
        });

        const repo = await service.getRepo('owner', 'repo');
        expect(repo).toEqual({ name: 'repo' });
        expect(global.fetch).toHaveBeenCalledWith('https://api.github.com/repos/owner/repo', expect.any(Object));
    });

    it('should return null if repo does not exist', async () => {
        (global.fetch as jest.Mock<any>).mockResolvedValue({
            status: 404,
            ok: false
        });

        const repo = await service.getRepo('owner', 'repo');
        expect(repo).toBeNull();
    });

    it('should handle get repo error', async () => {
        (global.fetch as jest.Mock<any>).mockResolvedValue({
            ok: false,
            status: 500,
            statusText: 'Error'
        });

        await expect(service.getRepo('owner', 'repo')).rejects.toThrow('Failed to get repo: 500 Error');
    });

    it('should create repo in user account', async () => {
        (global.fetch as jest.Mock<any>).mockResolvedValue({
            ok: true,
            json: async () => ({ full_name: 'user/repo' })
        });

        const repo = await service.createRepo('repo');
        expect(repo).toEqual({ full_name: 'user/repo' });
        expect(global.fetch).toHaveBeenCalledWith('https://api.github.com/user/repos', expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"name":"repo"')
        }));
    });

    it('should create repo in org', async () => {
        (global.fetch as jest.Mock<any>).mockResolvedValue({
            ok: true,
            json: async () => ({ full_name: 'org/repo' })
        });

        const repo = await service.createRepo('repo', 'org');
        expect(repo).toEqual({ full_name: 'org/repo' });
        expect(global.fetch).toHaveBeenCalledWith('https://api.github.com/orgs/org/repos', expect.any(Object));
    });

    it('should handle create repo error', async () => {
        (global.fetch as jest.Mock<any>).mockResolvedValue({
            ok: false,
            status: 422,
            statusText: 'Unprocessable Entity',
            text: async () => 'Error body'
        });

        await expect(service.createRepo('repo')).rejects.toThrow('Failed to create repo: 422 Unprocessable Entity - Error body');
    });
});
