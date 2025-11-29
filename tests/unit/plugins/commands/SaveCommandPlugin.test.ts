import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import type { SaveCommandPlugin as SaveCommandPluginType } from '../../../../src/plugins/commands/SaveCommandPlugin.js';

const mockGitService = {
    add: jest.fn(),
    commit: jest.fn(),
    pull: jest.fn(),
    push: jest.fn(),
    getCurrentBranch: jest.fn()
};

const mockCloudflareService = {
    // Cloudflare service is instantiated but not used in execute directly for deployment in the current impl
    // but we should mock it anyway
};

jest.unstable_mockModule('../../../../src/services/GitService.js', () => ({
    GitService: jest.fn().mockImplementation(() => mockGitService)
}));

jest.unstable_mockModule('../../../../src/services/CloudflareService.js', () => ({
    CloudflareService: jest.fn().mockImplementation(() => mockCloudflareService)
}));

const { SaveCommandPlugin } = await import('../../../../src/plugins/commands/SaveCommandPlugin.js');

describe('SaveCommandPlugin', () => {
    let plugin: SaveCommandPluginType;
    let mockOrchestrator: any;

    beforeEach(() => {
        mockOrchestrator = {
            config: {}
        };
        plugin = new SaveCommandPlugin(mockOrchestrator);

        mockGitService.add.mockReset();
        mockGitService.commit.mockReset();
        mockGitService.pull.mockReset();
        mockGitService.push.mockReset();
        mockGitService.getCurrentBranch.mockReset();
    });

    it('should return correct name', () => {
        expect(plugin.getName()).toBe('save');
    });

    it('should throw if args missing', async () => {
        await expect(plugin.execute([])).rejects.toThrow('Usage: /save');
    });

    it('should save changes', async () => {
        mockGitService.getCurrentBranch.mockReturnValue('feature');

        await plugin.execute(['message']);

        expect(mockGitService.add).toHaveBeenCalledWith('.');
        expect(mockGitService.commit).toHaveBeenCalledWith('message');
        expect(mockGitService.pull).toHaveBeenCalledWith('origin', 'feature');
        expect(mockGitService.push).toHaveBeenCalledWith('origin', 'feature');
    });

    it('should ignore nothing to commit error', async () => {
        mockGitService.getCurrentBranch.mockReturnValue('feature');
        mockGitService.commit.mockImplementation(() => { throw new Error('nothing to commit'); });

        await plugin.execute(['message']);

        expect(mockGitService.push).toHaveBeenCalled();
    });

    it('should throw on other commit errors', async () => {
        mockGitService.commit.mockImplementation(() => { throw new Error('other error'); });
        await expect(plugin.execute(['message'])).rejects.toThrow('other error');
    });

    it('should throw on pull error', async () => {
        mockGitService.getCurrentBranch.mockReturnValue('feature');
        mockGitService.pull.mockImplementation(() => { throw new Error('pull error'); });
        await expect(plugin.execute(['message'])).rejects.toThrow('Failed to pull remote changes');
    });
});
