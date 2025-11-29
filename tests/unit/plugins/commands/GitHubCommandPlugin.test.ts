import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import { GitHubCommandPlugin } from '../../../../src/plugins/commands/GitHubCommandPlugin.js';

describe('GitHubCommandPlugin', () => {
    let plugin: GitHubCommandPlugin;
    let mockOrchestrator: any;
    let mockFileSystemService: any;

    beforeEach(() => {
        mockFileSystemService = {
            exists: jest.fn<any>(),
            readFile: jest.fn<any>(),
            writeFile: jest.fn<any>()
        };

        mockOrchestrator = {
            config: {
                projectPath: '/test/project'
            },
            disk: mockFileSystemService
        };
        plugin = new GitHubCommandPlugin(mockOrchestrator);

        // Mock console.error/log
        jest.spyOn(console, 'error').mockImplementation(() => { });
        jest.spyOn(console, 'log').mockImplementation(() => { });
    });

    it('should have correct name', () => {
        expect(plugin.name).toBe('github');
    });

    it('should log error if args missing', async () => {
        await plugin.execute(['org']);
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Usage: /github'));
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
