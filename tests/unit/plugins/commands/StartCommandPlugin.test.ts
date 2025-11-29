import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import { StartCommandPlugin } from '../../../../src/plugins/commands/StartCommandPlugin.js';

describe('StartCommandPlugin', () => {
    let plugin: StartCommandPlugin;
    let mockOrchestrator: any;
    let mockGitService: any;

    beforeEach(() => {
        mockGitService = {
            checkout: jest.fn(),
            pull: jest.fn()
        };

        mockOrchestrator = {
            config: {},
            git: mockGitService
        };
        plugin = new StartCommandPlugin(mockOrchestrator);

        // Mock console.error/log
        jest.spyOn(console, 'error').mockImplementation(() => { });
        jest.spyOn(console, 'log').mockImplementation(() => { });
    });

    it('should have correct name', () => {
        expect(plugin.name).toBe('start');
    });

    it('should log error if args missing', async () => {
        await plugin.execute([]);
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Usage: /start'));
    });

    it('should start new branch', async () => {
        await plugin.execute(['feature']);

        expect(mockGitService.checkout).toHaveBeenCalledWith('main');
        expect(mockGitService.pull).toHaveBeenCalledWith('origin', 'main');
        expect(mockGitService.checkout).toHaveBeenCalledWith('feature', true);
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Started work on branch feature'));
    });

    it('should handle git errors', async () => {
        mockGitService.checkout.mockImplementation(() => { throw new Error('Git error'); });
        await expect(plugin.execute(['feature'])).rejects.toThrow('Git error');
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to start branch'));
    });
});
