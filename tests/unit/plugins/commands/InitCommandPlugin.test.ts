import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import type { InitCommandPlugin as InitCommandPluginType } from '../../../../src/plugins/commands/InitCommandPlugin.js';

const mockGitHubService = {
    getRepo: jest.fn<any>(),
    createRepo: jest.fn<any>()
};

const mockGitService = {
    init: jest.fn(),
    addRemote: jest.fn(),
    clone: jest.fn()
};

const mockFileSystemService = {
    exists: jest.fn(),
    ensureDir: jest.fn(),
    writeFile: jest.fn()
};

jest.unstable_mockModule('../../../../src/services/GitHubService.js', () => ({
    GitHubService: jest.fn().mockImplementation(() => mockGitHubService)
}));

jest.unstable_mockModule('../../../../src/services/GitService.js', () => ({
    GitService: jest.fn().mockImplementation(() => mockGitService)
}));

jest.unstable_mockModule('../../../../src/services/FileSystemService.js', () => ({
    FileSystemService: jest.fn().mockImplementation(() => mockFileSystemService)
}));

const { InitCommandPlugin } = await import('../../../../src/plugins/commands/InitCommandPlugin.js');

describe('InitCommandPlugin', () => {
    let plugin: InitCommandPluginType;
    let mockOrchestrator: any;

    beforeEach(() => {
        mockOrchestrator = {
            config: {
                projectPath: '/test/project'
            }
        };
        plugin = new InitCommandPlugin(mockOrchestrator);

        mockGitHubService.getRepo.mockReset();
        mockGitHubService.createRepo.mockReset();
        mockGitService.init.mockReset();
        mockGitService.addRemote.mockReset();
        mockGitService.clone.mockReset();
        mockFileSystemService.exists.mockReset();
        mockFileSystemService.ensureDir.mockReset();
        mockFileSystemService.writeFile.mockReset();
    });

    it('should return correct name', () => {
        expect(plugin.getName()).toBe('init');
    });

    it('should throw if args are missing', async () => {
        await expect(plugin.execute([])).rejects.toThrow('Usage: /init');
    });

    it('should throw if repo format is invalid', async () => {
        await expect(plugin.execute(['invalid'])).rejects.toThrow('Invalid GitHub repository format');
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
    it('should throw if repo format is invalid', async () => {
        await expect(plugin.execute(['invalidrepo'])).rejects.toThrow('Invalid GitHub repository format');
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
