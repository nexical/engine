import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import { SaveCommandPlugin } from '../../../../src/plugins/commands/SaveCommandPlugin.js';

describe('SaveCommandPlugin', () => {
    let plugin: SaveCommandPlugin;
    let mockOrchestrator: any;
    let mockGitService: any;

    beforeEach(() => {
        mockGitService = {
            add: jest.fn(),
            commit: jest.fn(),
            pull: jest.fn(),
            push: jest.fn(),
            getCurrentBranch: jest.fn()
        };

        mockOrchestrator = {
            config: {},
            git: mockGitService
        };
        plugin = new SaveCommandPlugin(mockOrchestrator);

        // Mock console.error/log
        jest.spyOn(console, 'error').mockImplementation(() => { });
        jest.spyOn(console, 'log').mockImplementation(() => { });
    });

    it('should have correct name', () => {
        expect(plugin.name).toBe('save');
    });

    it('should log error if args missing', async () => {
        await plugin.execute([]);
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Usage: /save'));
    });

    it('should save changes', async () => {
        mockGitService.getCurrentBranch.mockReturnValue('feature');

        await plugin.execute(['message']);

        expect(mockGitService.add).toHaveBeenCalledWith('.');
        expect(mockGitService.commit).toHaveBeenCalledWith('message');
        expect(mockGitService.pull).toHaveBeenCalledWith('origin', 'feature');
        expect(mockGitService.push).toHaveBeenCalledWith('origin', 'feature');
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Saved changes to feature'));
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
        await expect(plugin.execute(['message'])).rejects.toThrow('pull error');
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to pull remote changes'));
    });
});
