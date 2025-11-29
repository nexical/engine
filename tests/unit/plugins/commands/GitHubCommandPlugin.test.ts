import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import type { GitHubCommandPlugin as GitHubCommandPluginType } from '../../../../src/plugins/commands/GitHubCommandPlugin.js';

const mockFileSystemService = {
    exists: jest.fn<any>(),
    readFile: jest.fn<any>(),
    writeFile: jest.fn<any>()
};

jest.unstable_mockModule('../../../../src/services/FileSystemService.js', () => ({
    FileSystemService: jest.fn().mockImplementation(() => mockFileSystemService)
}));

const { GitHubCommandPlugin } = await import('../../../../src/plugins/commands/GitHubCommandPlugin.js');

describe('GitHubCommandPlugin', () => {
    let plugin: GitHubCommandPluginType;
    let mockOrchestrator: any;

    beforeEach(() => {
        mockOrchestrator = {
            config: {
                projectPath: '/test/project'
            }
        };
        plugin = new GitHubCommandPlugin(mockOrchestrator);

        mockFileSystemService.exists.mockReset();
        mockFileSystemService.readFile.mockReset();
        mockFileSystemService.writeFile.mockReset();
    });

    it('should return correct name', () => {
        expect(plugin.getName()).toBe('github');
    });

    it('should throw if args missing', async () => {
        await expect(plugin.execute(['org'])).rejects.toThrow('Usage: /github');
    });

    it('should update env vars', async () => {
        mockFileSystemService.exists.mockReturnValue(false);

        await plugin.execute(['org', 'key']);

        expect(mockFileSystemService.writeFile).toHaveBeenCalledWith(
            expect.stringContaining('.env'),
            expect.stringContaining('GITHUB_ORG=org')
        );
        expect(mockFileSystemService.writeFile).toHaveBeenCalledWith(
            expect.stringContaining('.env'),
            expect.stringContaining('GITHUB_API_KEY=key')
        );
    });
    it('should update existing keys', async () => {
        mockFileSystemService.exists.mockReturnValue(true);
        mockFileSystemService.readFile.mockResolvedValue('GITHUB_ORG=old\nGITHUB_API_KEY=old\nOTHER=val');

        await plugin.execute(['neworg', 'newkey']);

        expect(mockFileSystemService.writeFile).toHaveBeenCalledWith(
            expect.stringContaining('.env'),
            expect.stringContaining('GITHUB_ORG=neworg')
        );
        expect(mockFileSystemService.writeFile).toHaveBeenCalledWith(
            expect.stringContaining('.env'),
            expect.stringContaining('GITHUB_API_KEY=newkey')
        );
        expect(mockFileSystemService.writeFile).toHaveBeenCalledWith(
            expect.stringContaining('.env'),
            expect.stringContaining('OTHER=val')
        );
    });
});
