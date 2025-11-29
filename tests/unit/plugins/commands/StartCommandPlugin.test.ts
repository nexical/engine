import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import type { StartCommandPlugin as StartCommandPluginType } from '../../../../src/plugins/commands/StartCommandPlugin.js';

const mockGitService = {
    checkout: jest.fn(),
    pull: jest.fn()
};

jest.unstable_mockModule('../../../../src/services/GitService.js', () => ({
    GitService: jest.fn().mockImplementation(() => mockGitService)
}));

const { StartCommandPlugin } = await import('../../../../src/plugins/commands/StartCommandPlugin.js');

describe('StartCommandPlugin', () => {
    let plugin: StartCommandPluginType;
    let mockOrchestrator: any;

    beforeEach(() => {
        mockOrchestrator = {
            config: {}
        };
        plugin = new StartCommandPlugin(mockOrchestrator);

        mockGitService.checkout.mockReset();
        mockGitService.pull.mockReset();
    });

    it('should return correct name', () => {
        expect(plugin.getName()).toBe('start');
    });

    it('should throw if args missing', async () => {
        await expect(plugin.execute([])).rejects.toThrow('Usage: /start');
    });

    it('should start new branch', async () => {
        await plugin.execute(['feature']);

        expect(mockGitService.checkout).toHaveBeenCalledWith('main');
        expect(mockGitService.pull).toHaveBeenCalledWith('origin', 'main');
        expect(mockGitService.checkout).toHaveBeenCalledWith('feature', true);
    });

    it('should handle git errors', async () => {
        mockGitService.checkout.mockImplementation(() => { throw new Error('Git error'); });
        await expect(plugin.execute(['feature'])).rejects.toThrow('Failed to start branch: Git error');
    });
});
