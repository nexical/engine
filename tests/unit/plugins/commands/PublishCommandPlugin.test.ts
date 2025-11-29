import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import type { PublishCommandPlugin as PublishCommandPluginType } from '../../../../src/plugins/commands/PublishCommandPlugin.js';

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

jest.unstable_mockModule('../../../../src/services/GitService.js', () => ({
    GitService: jest.fn().mockImplementation(() => mockGitService)
}));

jest.unstable_mockModule('../../../../src/plugins/commands/SaveCommandPlugin.js', () => ({
    SaveCommandPlugin: jest.fn().mockImplementation(() => mockSavePlugin)
}));

const { PublishCommandPlugin } = await import('../../../../src/plugins/commands/PublishCommandPlugin.js');

describe('PublishCommandPlugin', () => {
    let publishPlugin: PublishCommandPluginType;
    let mockOrchestrator: any;

    beforeEach(() => {
        mockOrchestrator = {
            config: {},
        };
        publishPlugin = new PublishCommandPlugin(mockOrchestrator);

        mockGitService.getCurrentBranch.mockReset();
        mockGitService.checkout.mockReset();
        mockGitService.merge.mockReset();
        mockGitService.pull.mockReset();
        mockGitService.push.mockReset();
        mockSavePlugin.execute.mockReset();
    });

    it('should return correct name', () => {
        expect(publishPlugin.getName()).toBe('publish');
    });

    it('should publish from feature branch', async () => {
        mockGitService.getCurrentBranch.mockReturnValue('feature-branch');
        mockSavePlugin.execute.mockResolvedValue('Saved');

        await publishPlugin.execute(['commit message']);

        expect(mockSavePlugin.execute).toHaveBeenCalledWith(['commit message']);
        expect(mockGitService.checkout).toHaveBeenCalledWith('main');
        expect(mockGitService.merge).toHaveBeenCalledWith('feature-branch');
        expect(mockGitService.pull).toHaveBeenCalledWith('origin', 'main');
        expect(mockGitService.push).toHaveBeenCalledWith('origin', 'main');
        expect(mockGitService.checkout).toHaveBeenCalledWith('feature-branch');
    });

    it('should handle publishing from main', async () => {
        mockGitService.getCurrentBranch.mockReturnValue('main');
        mockSavePlugin.execute.mockResolvedValue('Saved');

        const result = await publishPlugin.execute([]);

        expect(mockSavePlugin.execute).toHaveBeenCalledWith(['Publishing changes']);
        expect(mockGitService.checkout).not.toHaveBeenCalled();
        expect(mockGitService.merge).not.toHaveBeenCalled();
        expect(result).toContain('Already on main');
    });
    it('should throw if checkout main fails', async () => {
        mockGitService.getCurrentBranch.mockReturnValue('feature');
        mockGitService.checkout.mockImplementation((branch) => {
            if (branch === 'main') throw new Error('Checkout failed');
        });

        await expect(publishPlugin.execute([])).rejects.toThrow('Failed to checkout main');
    });

    it('should throw if merge fails', async () => {
        mockGitService.getCurrentBranch.mockReturnValue('feature');
        mockGitService.merge.mockImplementation(() => {
            throw new Error('Merge failed');
        });

        await expect(publishPlugin.execute([])).rejects.toThrow('Failed to merge feature into main');
    });

    it('should throw if pull fails', async () => {
        mockGitService.getCurrentBranch.mockReturnValue('feature');
        mockGitService.pull.mockImplementation(() => {
            throw new Error('Pull failed');
        });

        await expect(publishPlugin.execute([])).rejects.toThrow('Failed to pull remote main');
    });

    it('should throw if push fails', async () => {
        mockGitService.getCurrentBranch.mockReturnValue('feature');
        mockGitService.push.mockImplementation(() => {
            throw new Error('Push failed');
        });

        await expect(publishPlugin.execute([])).rejects.toThrow('Failed to push main');
    });
});
