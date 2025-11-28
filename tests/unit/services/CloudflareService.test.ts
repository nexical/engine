import { jest, expect, describe, it, beforeEach, afterEach } from '@jest/globals';
import type { CloudflareService as CloudflareServiceType } from '../../../src/services/CloudflareService.js';

const mockSpawnSync = jest.fn();

jest.unstable_mockModule('child_process', () => ({
    spawnSync: mockSpawnSync,
}));

const { CloudflareService } = await import('../../../src/services/CloudflareService.js');

describe('CloudflareService', () => {
    let cloudflareService: CloudflareServiceType;
    let mockOrchestrator: any;
    let originalEnv: NodeJS.ProcessEnv;
    let mockFetch: any;

    beforeEach(() => {
        originalEnv = process.env;
        process.env = { ...originalEnv, CLOUDFLARE_API_TOKEN: 'token', CLOUDFLARE_ACCOUNT_ID: 'account' };

        mockOrchestrator = {};
        cloudflareService = new CloudflareService(mockOrchestrator);

        mockSpawnSync.mockReset();

        mockFetch = jest.fn() as any;
        global.fetch = mockFetch;
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('constructor', () => {
        it('should throw if env vars are missing', () => {
            process.env = { ...originalEnv };
            delete process.env.CLOUDFLARE_API_TOKEN;
            expect(() => new CloudflareService(mockOrchestrator)).toThrow();
        });
    });

    describe('createProject', () => {
        it('should create a project successfully', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ success: true })
            });

            await cloudflareService.createProject('test-project');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.cloudflare.com/client/v4/accounts/account/pages/projects',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer token'
                    }),
                    body: JSON.stringify({
                        name: 'test-project',
                        production_branch: 'main'
                    })
                })
            );
        });

        it('should handle conflict (409) gracefully', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 409,
                text: async () => 'Conflict'
            });

            await expect(cloudflareService.createProject('test-project')).resolves.not.toThrow();
        });

        it('should throw on other errors', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                text: async () => 'Error'
            });

            await expect(cloudflareService.createProject('test-project')).rejects.toThrow('Failed to create project');
        });
    });

    describe('deploy', () => {
        it('should deploy successfully', async () => {
            // Mock ensureProjectExists (createProject)
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ success: true })
            });

            mockSpawnSync.mockReturnValue({
                status: 0
            });

            const result = await cloudflareService.deploy('test-project', 'dist', 'main');

            expect(result).toBe('Deployment successful');
            expect(mockSpawnSync).toHaveBeenCalledWith('npx', ['wrangler', 'pages', 'deploy', 'dist', '--project-name', 'test-project', '--branch', 'main'], expect.any(Object));
        });

        it('should throw on deployment failure', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ success: true })
            });

            mockSpawnSync.mockReturnValue({
                status: 1
            });

            await expect(cloudflareService.deploy('test-project')).rejects.toThrow('Cloudflare deployment failed');
        });
    });

    describe('linkDomain', () => {
        it('should link domain successfully', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ success: true })
            });

            await cloudflareService.linkDomain('test-project', 'example.com');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.cloudflare.com/client/v4/accounts/account/pages/projects/test-project/domains',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({
                        name: 'example.com'
                    })
                })
            );
        });
        it('should throw if link domain fails', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 400,
                statusText: 'Bad Request',
                text: async () => 'Invalid domain'
            });

            await expect(cloudflareService.linkDomain('test-project', 'invalid.com')).rejects.toThrow('Failed to link domain');
        });

        it('should throw if API returns error', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ success: false, errors: ['API Error'] })
            });

            await expect(cloudflareService.linkDomain('test-project', 'example.com')).rejects.toThrow('Cloudflare API error');
        });

        it('should handle network errors', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));
            await expect(cloudflareService.linkDomain('test-project', 'example.com')).rejects.toThrow('Network error');
        });
    });
});
