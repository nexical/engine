import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { CreateCommand } from '../../../src/commands/CreateCommand.js';
import { Orchestrator } from '../../../src/orchestrator.js';
import { CloudflareService } from '../../../src/services/CloudflareService.js';
import { GitHubService } from '../../../src/services/GitHubService.js';

describe('CreateCommand', () => {
    let orchestrator: Orchestrator;
    let cfService: CloudflareService;
    let ghService: GitHubService;
    let command: CreateCommand;
    let mockClient: any;
    let mockIdentityManager: any;

    beforeEach(() => {
        cfService = {
            ensureProjectExists: jest.fn<any>().mockResolvedValue(true),
            addDomain: jest.fn<any>().mockResolvedValue(true)
        } as unknown as CloudflareService;

        ghService = {
            getRepo: jest.fn<any>().mockResolvedValue(null), // Default to not found, so it tries create
            createRepo: jest.fn<any>().mockResolvedValue({ full_name: 'test/repo' }),
            getUser: jest.fn<any>().mockResolvedValue({ login: 'testuser' })
        } as unknown as GitHubService;

        mockClient = {
            projects: {
                get: jest.fn<any>().mockResolvedValue({
                    id: 123,
                    name: 'test-project',
                    repoUrl: 'https://github.com/testuser/test-project',
                    domain: 'test.com'
                })
            }
        };

        mockIdentityManager = {
            getClient: jest.fn().mockReturnValue(mockClient)
        };

        orchestrator = {
            cloudflare: cfService,
            github: ghService,
            jobContext: { teamId: 1 },
            identityManager: mockIdentityManager
        } as unknown as Orchestrator;

        command = new CreateCommand(orchestrator);
    });

    it('should have correct name and description', () => {
        expect(command.name).toBe('create');
        expect(command.description).toContain('Usage: /create <projectId>');
    });

    it('should log error if no arguments provided', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        await command.execute([]);
        expect(consoleSpy).toHaveBeenCalledWith('Usage: /create <projectId>');
    });

    it('should execute full creation flow successfully', async () => {
        const projectId = '123';
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });

        await command.execute([projectId]);

        // GitHub checks
        expect(ghService.getRepo).toHaveBeenCalledWith('testuser', 'test-project');
        expect(ghService.createRepo).toHaveBeenCalledWith('test-project', undefined);

        // Cloudflare project
        expect(cfService.ensureProjectExists).toHaveBeenCalledWith('test-project', 'https://github.com/testuser/test-project');

        // Cloudflare domain
        expect(cfService.addDomain).toHaveBeenCalledWith('test-project', 'test.com');

        expect(consoleLogSpy).toHaveBeenCalledWith(`Project 123 (test-project) provisioning complete.`);
    });

    it('should skip creation if repo exists', async () => {
        (ghService.getRepo as jest.Mock<any>).mockResolvedValue({ full_name: 'testuser/test-project' });
        const projectId = '123';
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });

        await command.execute([projectId]);

        expect(ghService.createRepo).not.toHaveBeenCalled();
        expect(consoleLogSpy).toHaveBeenCalledWith('Repository testuser/test-project already exists.');
    });

    it('should skip domain linking if no domain', async () => {
        mockClient.projects.get.mockResolvedValue({
            id: 123,
            name: 'test-project',
            repoUrl: 'https://github.com/testuser/test-project'
        });

        await command.execute(['123']);
        expect(cfService.addDomain).not.toHaveBeenCalled();
    });

    it('should handle errors', async () => {
        mockClient.projects.get.mockRejectedValue(new Error('API Error'));
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        await expect(command.execute(['123'])).rejects.toThrow('API Error');
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to create project resources'));
    });

    it('should validate arguments', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        await command.execute([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Usage: /create <projectId>');

        await command.execute(['abc']);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Project ID must be a number.');
    });

    it('should handle missing teamId', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        orchestrator.jobContext = undefined;
        await command.execute(['123']);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Team ID not found in job context.');
    });

    it('should handle missing client', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        (mockIdentityManager.getClient as jest.Mock).mockReturnValue(undefined);
        await command.execute(['123']);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Nexical Client not available.');
    });

    it('should handle project not found', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        (mockIdentityManager.getClient().projects.get as jest.Mock<any>).mockResolvedValue(null);
        await command.execute(['123']);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Project 123 not found.');
    });

    it('should handle unparseable repoUrl', async () => {
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
        (mockIdentityManager.getClient().projects.get as jest.Mock<any>).mockResolvedValue({
            id: 123,
            name: 'test-project',
            repoUrl: 'https://gitlab.com/foo/bar', // Not github
            domain: null
        });

        await command.execute(['123']);
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Could not parse GitHub details'));
    });

    it('should handle missing repoUrl for Cloudflare check', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        (mockIdentityManager.getClient().projects.get as jest.Mock<any>).mockResolvedValue({
            id: 123,
            name: 'test-project',
            repoUrl: null,
            domain: null
        });

        await command.execute(['123']);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Project repoUrl is missing. Cannot ensure Cloudflare project exists.');
    });
    it('should pass owner to createRepo if different from authenticated user', async () => {
        (ghService.getRepo as jest.Mock<any>).mockResolvedValue(null);
        (mockIdentityManager.getClient().projects.get as jest.Mock<any>).mockResolvedValue({
            id: 123,
            name: 'org-project',
            repoUrl: 'https://github.com/myorg/org-project',
            domain: null
        });

        await command.execute(['123']);

        expect(ghService.createRepo).toHaveBeenCalledWith('org-project', 'myorg');
    });
});
