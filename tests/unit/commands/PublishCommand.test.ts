import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { PublishCommand } from '../../../src/commands/PublishCommand.js';
import { Orchestrator } from '../../../src/orchestrator.js';
import { GitService } from '../../../src/services/GitService.js';

describe('PublishCommand', () => {
    let orchestrator: Orchestrator;
    let gitService: GitService;
    let command: PublishCommand;
    let mockClient: any;
    let mockIdentityManager: any;

    beforeEach(() => {
        gitService = {
            checkout: jest.fn(),
            pull: jest.fn(),
            merge: jest.fn(),
            push: jest.fn(),
        } as unknown as GitService;

        mockClient = {
            projects: {
                get: jest.fn<any>().mockResolvedValue({ id: 123, name: 'test-project' })
            }
        };

        mockIdentityManager = {
            getClient: jest.fn().mockReturnValue(mockClient)
        };

        orchestrator = {
            git: gitService,
            jobContext: { teamId: 1 },
            identityManager: mockIdentityManager
        } as unknown as Orchestrator;

        command = new PublishCommand(orchestrator);
    });

    it('should have correct name and description', () => {
        expect(command.name).toBe('publish');
        expect(command.description).toContain('Usage: /publish <projectId> <branch name>');
    });

    it('should log error if no arguments provided', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        await command.execute([]);
        expect(consoleSpy).toHaveBeenCalledWith('Usage: /publish <projectId> <branch name>');
        expect(gitService.checkout).not.toHaveBeenCalled();
    });

    it('should execute git workflow successfully', async () => {
        const branchName = 'job-123';
        const projectId = '456';
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });

        await command.execute([projectId, branchName]);

        expect(mockClient.projects.get).toHaveBeenCalledWith(1, 456);
        expect(gitService.checkout).toHaveBeenCalledWith('main');
        expect(gitService.pull).toHaveBeenCalledWith('origin', 'main');
        expect(gitService.merge).toHaveBeenCalledWith(branchName);
        expect(gitService.push).toHaveBeenCalledWith('origin', 'main');
        expect(consoleLogSpy).toHaveBeenCalledWith(`Successfully published ${branchName} to main.`);
    });

    it('should validate arguments', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        await command.execute(['123']);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Usage: /publish <projectId> <branch name>');

        await command.execute(['abc', 'main']);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Project ID must be a number.');
    });

    it('should handle missing teamId', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        orchestrator.jobContext = undefined;
        await command.execute(['123', 'feature']);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Team ID not found in job context.');
    });

    it('should handle missing client', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        (mockIdentityManager.getClient as jest.Mock).mockReturnValue(undefined);
        await command.execute(['123', 'feature']);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Nexical Client not available.');
    });

    it('should handle errors', async () => {
        const branchName = 'job-error';
        const projectId = '456';
        const error = new Error('Git error');
        (gitService.checkout as jest.Mock).mockImplementation(() => {
            throw error;
        });
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        await expect(command.execute([projectId, branchName])).rejects.toThrow('Git error');
        expect(consoleErrorSpy).toHaveBeenCalledWith(`Failed to publish branch ${branchName}: Git error`);
    });
});
