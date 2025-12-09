import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import { InitCommand } from '../../../src/commands/InitCommand.js';

describe('InitCommand', () => {
    let plugin: InitCommand;
    let mockOrchestrator: any;
    let mockGitHubService: any;
    let mockGitService: any;
    let mockFileSystemService: any;

    beforeEach(() => {
        mockGitHubService = {
            getRepo: jest.fn<any>(),
            createRepo: jest.fn<any>()
        };

        mockGitService = {
            init: jest.fn(),
            addRemote: jest.fn(),
            clone: jest.fn()
        };

        mockFileSystemService = {
            exists: jest.fn(),
            ensureDir: jest.fn(),
            writeFile: jest.fn()
        };

        mockOrchestrator = {
            config: {
                projectPath: '/test/project'
            },
            github: mockGitHubService,
            git: mockGitService,
            disk: mockFileSystemService
        };
        plugin = new InitCommand(mockOrchestrator);

        // Mock console.error/log
        jest.spyOn(console, 'error').mockImplementation(() => { });
        jest.spyOn(console, 'log').mockImplementation(() => { });
    });

    it('should have correct name', () => {
        expect(plugin.name).toBe('init');
    });

    it('should log error if args are missing', async () => {
        await plugin.execute([]);
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Usage: /init'));
    });

    it('should log error if repo format is invalid', async () => {
        await plugin.execute(['invalid']);
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Invalid GitHub repository format'));
    });

    it('should init in current directory with existing repo', async () => {
        mockGitHubService.getRepo.mockResolvedValue({ clone_url: 'https://github.com/org/repo.git' });

        await plugin.execute(['org/repo']);

        expect(mockGitHubService.getRepo).toHaveBeenCalledWith('org', 'repo');
        expect(mockGitService.init).toHaveBeenCalled();
        expect(mockGitService.addRemote).toHaveBeenCalledWith('origin', 'https://github.com/org/repo.git');
        expect(mockFileSystemService.ensureDir).toHaveBeenCalled();
        expect(mockFileSystemService.writeFile).toHaveBeenCalledTimes(2); // capabilities and config
    });

    it('should create repo if it does not exist', async () => {
        mockGitHubService.getRepo.mockResolvedValue(null);
        mockGitHubService.createRepo.mockResolvedValue({ clone_url: 'https://github.com/org/repo.git' });

        await plugin.execute(['org/repo']);

        expect(mockGitHubService.createRepo).toHaveBeenCalledWith('repo', 'org');
        expect(mockGitService.init).toHaveBeenCalled();
    });

    it('should clone into directory', async () => {
        mockGitHubService.getRepo.mockResolvedValue({ clone_url: 'https://github.com/org/repo.git' });
        mockFileSystemService.exists.mockReturnValue(false);

        await plugin.execute(['org/repo', 'dir']);

        expect(mockGitService.clone).toHaveBeenCalledWith('https://github.com/org/repo.git', 'dir');
    });

    it('should not overwrite existing config files', async () => {
        mockGitHubService.getRepo.mockResolvedValue({ clone_url: 'https://github.com/org/repo.git' });
        mockFileSystemService.exists.mockReturnValue(true); // Files exist

        await plugin.execute(['org/repo', '.']);

        expect(mockFileSystemService.writeFile).not.toHaveBeenCalled();
    });

    it('should handle existing directory', async () => {
        mockGitHubService.getRepo.mockResolvedValue({ clone_url: 'https://github.com/org/repo.git' });
        mockFileSystemService.exists.mockReturnValue(true);

        await plugin.execute(['org/repo', 'existing-dir']);

        expect(mockGitService.clone).toHaveBeenCalledWith('https://github.com/org/repo.git', 'existing-dir');
    });
});
