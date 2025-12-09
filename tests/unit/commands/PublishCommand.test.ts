import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import { PublishCommand } from '../../../src/commands/PublishCommand.js';

const mockGitService = {
    getCurrentBranch: jest.fn(),
    checkout: jest.fn(),
    merge: jest.fn(),
    pull: jest.fn(),
    push: jest.fn(),
    runCommand: jest.fn()
};

const mockSavePlugin = {
    execute: jest.fn<any>()
};

jest.unstable_mockModule('../../../src/services/GitService.js', () => ({
    GitService: jest.fn().mockImplementation(() => mockGitService)
}));

jest.unstable_mockModule('../../../src/commands/SaveCommand.js', () => ({
    SaveCommand: jest.fn().mockImplementation(() => mockSavePlugin)
}));

const { PublishCommand: PublishCommandClass } = await import('../../../src/commands/PublishCommand.js');

describe('PublishCommand', () => {
    let publishPlugin: InstanceType<typeof PublishCommandClass>;
    let mockOrchestrator: any;

    beforeEach(() => {
        mockOrchestrator = {
            config: {},
            git: mockGitService
        };
        publishPlugin = new PublishCommandClass(mockOrchestrator);

        mockGitService.getCurrentBranch.mockReset();
        mockGitService.checkout.mockReset();
        mockGitService.merge.mockReset();
        mockGitService.pull.mockReset();
        mockGitService.push.mockReset();
        mockSavePlugin.execute.mockReset();

        // Mock console.error/log
        jest.spyOn(console, 'error').mockImplementation(() => { });
        jest.spyOn(console, 'log').mockImplementation(() => { });
    });

    it('should have correct name', () => {
        expect(publishPlugin.name).toBe('publish');
    });

    it('should publish from feature branch', async () => {
        mockGitService.getCurrentBranch.mockReturnValue('feature-branch');
        mockSavePlugin.execute.mockResolvedValue(undefined);

        await publishPlugin.execute(['commit message']);

        expect(mockSavePlugin.execute).toHaveBeenCalledWith(['commit message']);
        expect(mockGitService.checkout).toHaveBeenCalledWith('main');
        expect(mockGitService.merge).toHaveBeenCalledWith('feature-branch');
        expect(mockGitService.pull).toHaveBeenCalledWith('origin', 'main');
        expect(mockGitService.push).toHaveBeenCalledWith('origin', 'main');
        expect(mockGitService.checkout).toHaveBeenCalledWith('feature-branch');
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Published feature-branch to production'));
    });

    it('should handle publishing from main', async () => {
        mockGitService.getCurrentBranch.mockReturnValue('main');
        mockSavePlugin.execute.mockResolvedValue(undefined);

        await publishPlugin.execute([]);

        expect(mockSavePlugin.execute).toHaveBeenCalledWith(['Publishing changes']);
        expect(mockGitService.checkout).not.toHaveBeenCalled();
        expect(mockGitService.merge).not.toHaveBeenCalled();
        expect(console.log).toHaveBeenCalledWith('Already on main. Changes saved and pushed.');
    });

    it('should throw if checkout main fails', async () => {
        mockGitService.getCurrentBranch.mockReturnValue('feature');
        mockGitService.checkout.mockImplementation((branch: any) => {
            if (branch === 'main') throw new Error('Checkout failed');
        });

        await expect(publishPlugin.execute([])).rejects.toThrow('Checkout failed');
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to checkout main'));
    });

    it('should throw if merge fails', async () => {
        mockGitService.getCurrentBranch.mockReturnValue('feature');
        mockGitService.merge.mockImplementation(() => {
            throw new Error('Merge failed');
        });

        await expect(publishPlugin.execute([])).rejects.toThrow('Merge failed');
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to merge feature into main'));
    });

    it('should throw if pull fails', async () => {
        mockGitService.getCurrentBranch.mockReturnValue('feature');
        mockGitService.pull.mockImplementation(() => {
            throw new Error('Pull failed');
        });

        await expect(publishPlugin.execute([])).rejects.toThrow('Pull failed');
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to pull remote main'));
    });

    it('should throw if push fails', async () => {
        mockGitService.getCurrentBranch.mockReturnValue('feature');
        mockGitService.push.mockImplementation(() => {
            throw new Error('Push failed');
        });

        await expect(publishPlugin.execute([])).rejects.toThrow('Push failed');
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to push main'));
    });
});
