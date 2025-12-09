import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { CloseCommand } from '../../../src/commands/CloseCommand.js';
import { Orchestrator } from '../../../src/orchestrator.js';
import { GitService } from '../../../src/services/GitService.js';

describe('CloseCommand', () => {
    let orchestrator: Orchestrator;
    let gitService: GitService;
    let command: CloseCommand;
    let mockClient: any;
    let mockIdentityManager: any;

    beforeEach(() => {
        gitService = {
            checkout: jest.fn(),
            deleteBranch: jest.fn(),
            pushDelete: jest.fn(),
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

        command = new CloseCommand(orchestrator);
    });

    it('should have correct name and description', () => {
        expect(command.name).toBe('close');
        expect(command.description).toContain('Usage: /close <projectId> <branch name>');
    });

    it('should log error if not enough arguments provided', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        await command.execute(['job-123']);
        expect(consoleSpy).toHaveBeenCalledWith('Usage: /close <projectId> <branch name>');
        expect(gitService.checkout).not.toHaveBeenCalled();
    });

    it('should execute git workflow successfully', async () => {
        const branchName = 'job-123';
        const projectId = '456';
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });

        await command.execute([projectId, branchName]);

        expect(mockClient.projects.get).toHaveBeenCalledWith(1, 456);
        expect(gitService.checkout).toHaveBeenCalledWith('main');
        expect(gitService.deleteBranch).toHaveBeenCalledWith(branchName, true);
        expect(gitService.pushDelete).toHaveBeenCalledWith('origin', branchName);
        expect(consoleLogSpy).toHaveBeenCalledWith(`Successfully closed ${branchName}. Preview deployment should be cleaned up automatically.`);
    });

    it('should validate arguments', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        await command.execute(['123']); // Missing branch
        expect(consoleErrorSpy).toHaveBeenCalledWith('Usage: /close <projectId> <branch name>');

        await command.execute(['abc', 'branch']);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Project ID must be a number.');
    });

    it('should handle missing teamId', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        orchestrator.jobContext = undefined;
        await command.execute(['123', 'branch']);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Team ID not found in job context.');
    });

    it('should handle missing client', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        (mockIdentityManager.getClient as jest.Mock).mockReturnValue(undefined);
        await command.execute(['123', 'branch']);
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
        expect(consoleErrorSpy).toHaveBeenCalledWith(`Failed to close branch ${branchName}: Git error`);
    });
});
