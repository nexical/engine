import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import type { PublishCommandPlugin as PublishCommandPluginType } from '../../../../src/plugins/commands/PublishCommandPlugin.js';

const mockCloudflareService = {
    deploy: jest.fn() as any,
    linkDomain: jest.fn() as any
};

const mockDeployUtils = {
    loadConfig: jest.fn() as any
};

jest.unstable_mockModule('../../../../src/services/CloudflareService.js', () => ({
    CloudflareService: jest.fn().mockImplementation(() => mockCloudflareService)
}));

jest.unstable_mockModule('../../../../src/models/Deployment.js', () => ({
    DeployUtils: mockDeployUtils
}));

const { PublishCommandPlugin } = await import('../../../../src/plugins/commands/PublishCommandPlugin.js');

describe('PublishCommandPlugin', () => {
    let publishPlugin: PublishCommandPluginType;
    let mockOrchestrator: any;

    beforeEach(() => {
        mockOrchestrator = {
            config: {},
            git: {
                runCommand: jest.fn(),
                commit: jest.fn()
            }
        };
        publishPlugin = new PublishCommandPlugin(mockOrchestrator);

        mockCloudflareService.deploy.mockReset();
        mockCloudflareService.linkDomain.mockReset();
        mockDeployUtils.loadConfig.mockReset();
    });

    it('should deploy production environment', async () => {
        mockDeployUtils.loadConfig.mockReturnValue({
            project_name: 'test-project',
            production_domain: 'example.com'
        });
        mockOrchestrator.git.runCommand.mockReturnValue(''); // Clean status
        mockCloudflareService.deploy.mockResolvedValue('success');
        mockCloudflareService.linkDomain.mockResolvedValue('success');

        await publishPlugin.execute();

        expect(mockDeployUtils.loadConfig).toHaveBeenCalledWith(mockOrchestrator.config);
        expect(mockOrchestrator.git.runCommand).toHaveBeenCalledWith(['status', '--porcelain']);
        expect(mockOrchestrator.git.commit).not.toHaveBeenCalled();
        expect(mockCloudflareService.deploy).toHaveBeenCalledWith('test-project', '.', 'main');
        expect(mockCloudflareService.linkDomain).toHaveBeenCalledWith('test-project', 'example.com');
    });

    it('should auto-commit changes before deploy', async () => {
        mockDeployUtils.loadConfig.mockReturnValue({
            project_name: 'test-project'
        });
        mockOrchestrator.git.runCommand.mockReturnValue('M file.txt'); // Dirty status
        mockCloudflareService.deploy.mockResolvedValue('success');

        await publishPlugin.execute();

        expect(mockOrchestrator.git.commit).toHaveBeenCalledWith("Auto-commit before deployment");
        expect(mockCloudflareService.deploy).toHaveBeenCalled();
    });

    it('should handle git check failure', async () => {
        mockDeployUtils.loadConfig.mockReturnValue({
            project_name: 'test-project'
        });
        mockOrchestrator.git.runCommand.mockImplementation(() => { throw new Error('Git error'); });

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        await publishPlugin.execute();
        expect(consoleSpy).toHaveBeenCalledWith('Git check failed:', expect.any(Error));
        expect(mockCloudflareService.deploy).not.toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('should handle deployment failure', async () => {
        mockDeployUtils.loadConfig.mockReturnValue({
            project_name: 'test-project'
        });
        mockOrchestrator.git.runCommand.mockReturnValue('');
        mockCloudflareService.deploy.mockRejectedValue(new Error('Deploy failed'));

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        await publishPlugin.execute();
        expect(consoleSpy).toHaveBeenCalledWith('Deployment failed:', expect.any(Error));
        consoleSpy.mockRestore();
    });
});
