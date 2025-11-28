import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import type { PreviewCommandPlugin as PreviewCommandPluginType } from '../../../../src/plugins/commands/PreviewCommandPlugin.js';

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

const { PreviewCommandPlugin } = await import('../../../../src/plugins/commands/PreviewCommandPlugin.js');

describe('PreviewCommandPlugin', () => {
    let previewPlugin: PreviewCommandPluginType;
    let mockOrchestrator: any;

    beforeEach(() => {
        mockOrchestrator = {
            config: {},
            git: {
                getCurrentBranch: jest.fn().mockReturnValue('feature-branch')
            }
        };
        previewPlugin = new PreviewCommandPlugin(mockOrchestrator);

        mockCloudflareService.deploy.mockReset();
        mockCloudflareService.linkDomain.mockReset();
        mockDeployUtils.loadConfig.mockReset();
    });

    it('should deploy preview environment', async () => {
        mockDeployUtils.loadConfig.mockReturnValue({
            project_name: 'test-project',
            preview_domain: 'preview.example.com'
        });
        mockCloudflareService.deploy.mockResolvedValue('success');
        mockCloudflareService.linkDomain.mockResolvedValue('success');

        await previewPlugin.execute();

        expect(mockDeployUtils.loadConfig).toHaveBeenCalledWith(mockOrchestrator.config);
        expect(mockOrchestrator.git.getCurrentBranch).toHaveBeenCalled();
        expect(mockCloudflareService.deploy).toHaveBeenCalledWith('test-project', '.', 'feature-branch');
        expect(mockCloudflareService.linkDomain).toHaveBeenCalledWith('test-project', 'preview.example.com');
    });

    it('should skip domain linking if not configured', async () => {
        mockDeployUtils.loadConfig.mockReturnValue({
            project_name: 'test-project'
        });
        mockCloudflareService.deploy.mockResolvedValue('success');

        await previewPlugin.execute();

        expect(mockCloudflareService.deploy).toHaveBeenCalled();
        expect(mockCloudflareService.linkDomain).not.toHaveBeenCalled();
    });

    it('should handle deployment failure', async () => {
        mockDeployUtils.loadConfig.mockReturnValue({
            project_name: 'test-project'
        });
        mockCloudflareService.deploy.mockRejectedValue(new Error('Deploy failed'));

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        await previewPlugin.execute();
        expect(consoleSpy).toHaveBeenCalledWith('Preview deployment failed:', expect.any(Error));
        consoleSpy.mockRestore();
    });
});
