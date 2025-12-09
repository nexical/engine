import { jest, expect, describe, it, beforeEach, afterEach } from '@jest/globals';
import type { CloudflareService as CloudflareServiceType } from '../../../src/services/CloudflareService.js';

const mockSpawnSync = jest.fn();

jest.unstable_mockModule('child_process', () => ({
    spawnSync: mockSpawnSync,
}));

const { CloudflareService } = await import('../../../src/services/CloudflareService.js');

describe('CloudflareService', () => {
    let cloudflareService: CloudflareServiceType;
    let originalEnv: NodeJS.ProcessEnv;
    let mockFetch: any;

    beforeEach(() => {
        originalEnv = process.env;
        process.env = { ...originalEnv, CLOUDFLARE_API_TOKEN: 'token', CLOUDFLARE_ACCOUNT_ID: 'account' };

        cloudflareService = new CloudflareService();

        mockFetch = jest.fn() as any;
        global.fetch = mockFetch;
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('ensureProjectExists', () => {
        it('should return true if project exists (200 OK)', async () => {
            mockFetch.mockResolvedValueOnce({
                status: 200,
                json: async () => ({ success: true })
            });

            const result = await cloudflareService.ensureProjectExists('test-project', 'https://github.com/owner/repo');

            expect(result).toBe(true);
            const [url] = mockFetch.mock.calls[0];
            expect(url).toContain('/pages/projects/test-project');
        });

        it('should create project if it does not exist (404)', async () => {
            // First call returns 404
            mockFetch.mockResolvedValueOnce({
                status: 404,
                text: async () => 'Not Found'
            });
            // Second call (create) returns 200
            mockFetch.mockResolvedValueOnce({
                status: 200,
                json: async () => ({ success: true })
            });

            const result = await cloudflareService.ensureProjectExists('test-project', 'https://github.com/owner/repo');

            expect(result).toBe(true);
            expect(mockFetch).toHaveBeenCalledTimes(2);
            // Check second call payload
            const [createUrl, createOptions] = mockFetch.mock.calls[1];
            const body = JSON.parse(createOptions.body);
            expect(body.name).toBe('test-project');
            expect(body.source.config.owner).toBe('owner');
            expect(body.source.config.repo_name).toBe('repo');
        });

        it('should fail if credentials are missing', async () => {
            delete process.env.CLOUDFLARE_API_TOKEN;
            // Re-instantiate to pick up env change (constructor reads env)
            cloudflareService = new CloudflareService();
            const result = await cloudflareService.ensureProjectExists('test-project', 'repo');
            expect(result).toBe(false);
        });

        it('should return false if checkUrl returns non-200/404', async () => {
            mockFetch.mockResolvedValueOnce({
                status: 500,
                statusText: 'Server Error',
                text: async () => 'Internal Error'
            });

            const result = await cloudflareService.ensureProjectExists('test-project', 'repo');
            expect(result).toBe(false);
        });

        it('should return false if createProject fails (API error logic)', async () => {
            mockFetch.mockResolvedValueOnce({ status: 404, text: async () => 'Not Found' });
            mockFetch.mockResolvedValueOnce({
                status: 200,
                json: async () => ({ success: false, errors: ['Failed'] })
            });

            const result = await cloudflareService.ensureProjectExists('test-project', 'repo');
            expect(result).toBe(false);
        });

        it('should return false if createProject fails (Network error)', async () => {
            mockFetch.mockResolvedValueOnce({ status: 404, text: async () => 'Not Found' });
            mockFetch.mockRejectedValueOnce(new Error('Network Error'));

            const result = await cloudflareService.ensureProjectExists('test-project', 'repo');
            expect(result).toBe(false);
        });

        it('should return false if createProject returns non-200 status', async () => {
            mockFetch.mockResolvedValueOnce({ status: 404, text: async () => 'Not Found' });
            mockFetch.mockResolvedValueOnce({
                status: 500,
                text: async () => 'Server Error'
            });

            const result = await cloudflareService.ensureProjectExists('test-project', 'repo');
            expect(result).toBe(false);
        });

        it('should handle non-matching repo URL without source config', async () => {
            mockFetch.mockResolvedValueOnce({ status: 404, text: async () => 'Not Found' });
            mockFetch.mockResolvedValueOnce({
                status: 200,
                json: async () => ({ success: true })
            });

            const result = await cloudflareService.ensureProjectExists('test-project', 'invalid-url');
            expect(result).toBe(true);

            const [createUrl, createOptions] = mockFetch.mock.calls[1];
            const body = JSON.parse(createOptions.body);
            expect(body.source).toBeUndefined();
        });

        it('should return false if checkUrl throws exception', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network Error'));
            const result = await cloudflareService.ensureProjectExists('test-project', 'repo');
            expect(result).toBe(false);
        });
        it('should use default empty strings if env vars missing', () => {
            const originalId = process.env.CLOUDFLARE_ACCOUNT_ID;
            delete process.env.CLOUDFLARE_ACCOUNT_ID;
            const service = new CloudflareService();
            // access private field via any
            expect((service as any).accountId).toBe('');
            process.env.CLOUDFLARE_ACCOUNT_ID = originalId;
        });

        it('should handle missing repoUrl in createProject', async () => {
            mockFetch.mockResolvedValueOnce({ status: 404, text: async () => 'Not Found' });
            mockFetch.mockResolvedValueOnce({ status: 200, json: async () => ({ success: true }) });

            await cloudflareService.ensureProjectExists('test', '');
            // Should succeed but without source config
            const [createUrl, createOptions] = mockFetch.mock.calls[1];
            const body = JSON.parse(createOptions.body);
            expect(body.source).toBeUndefined();
        });

        it('should use messages if errors missing in failure', async () => {
            mockFetch.mockResolvedValueOnce({ status: 404, text: async () => 'Not Found' });
            mockFetch.mockResolvedValueOnce({
                status: 200,
                json: async () => ({ success: false, messages: ['Some Message'] })
            });

            const result = await cloudflareService.ensureProjectExists('test', 'repo');
            expect(result).toBe(false);
        });
    });
});

