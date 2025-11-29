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
});
