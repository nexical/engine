import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { DestroyCommand } from '../../../src/commands/DestroyCommand.js';
import { Orchestrator } from '../../../src/orchestrator.js';
import { CloudflareService } from '../../../src/services/CloudflareService.js';

describe('DestroyCommand', () => {
    let orchestrator: Orchestrator;
    let cfService: CloudflareService;
    let command: DestroyCommand;
    let mockClient: any;
    let mockIdentityManager: any;

    beforeEach(() => {
        cfService = {
            deleteProject: jest.fn<any>().mockResolvedValue(true)
        } as unknown as CloudflareService;

        mockClient = {
            projects: {
                get: jest.fn<any>().mockResolvedValue({ id: 123, name: 'test-project', repoUrl: 'url' }),
                delete: jest.fn<any>().mockResolvedValue(true)
            }
        };

        mockIdentityManager = {
            getClient: jest.fn().mockReturnValue(mockClient)
        };

        orchestrator = {
            cloudflare: cfService,
            jobContext: { teamId: 1 },
            identityManager: mockIdentityManager
        } as unknown as Orchestrator;

        command = new DestroyCommand(orchestrator);
    });

    it('should have correct name and description', () => {
        expect(command.name).toBe('destroy');
        expect(command.description).toContain('Usage: /destroy <projectId>');
    });

    it('should log error if no arguments provided', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        await command.execute([]);
        expect(consoleSpy).toHaveBeenCalledWith('Usage: /destroy <projectId>');
    });

    it('should execute full destroy flow successfully', async () => {
        const projectId = '123';
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });

        await command.execute([projectId]);

        expect(cfService.deleteProject).toHaveBeenCalledWith('test-project');
        expect(mockClient.projects.delete).toHaveBeenCalledWith(1, 123);
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Destroy command completed'));
    });

    it('should log error if project fetch fails', async () => {
        mockClient.projects.get.mockRejectedValue(new Error('Not found'));
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        await command.execute(['123']);

        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Could not fetch project 123'));
        expect(cfService.deleteProject).not.toHaveBeenCalled(); // Should assume safely failed?
    });

    it('should validate arguments', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        await command.execute([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Usage: /destroy <projectId>');

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
        expect(consoleErrorSpy).toHaveBeenCalledWith('Aborting destroy command.');
    });

    it('should handle general errors', async () => {
        // We mock deleteProject to throw, which is called after getProject succeeds
        (cfService.deleteProject as jest.Mock<any>).mockRejectedValue(new Error('Crashed'));
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        await expect(command.execute(['123'])).rejects.toThrow('Crashed');
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to destroy project: Crashed'));
    });
});
