import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import type { CloudflareCommandPlugin as CloudflareCommandPluginType } from '../../../../src/plugins/commands/CloudflareCommandPlugin.js';

const mockFileSystemService = {
    exists: jest.fn<any>(),
    readFile: jest.fn<any>(),
    writeFile: jest.fn<any>()
};

jest.unstable_mockModule('../../../../src/services/FileSystemService.js', () => ({
    FileSystemService: jest.fn().mockImplementation(() => mockFileSystemService)
}));

const { CloudflareCommandPlugin } = await import('../../../../src/plugins/commands/CloudflareCommandPlugin.js');

describe('CloudflareCommandPlugin', () => {
    let plugin: CloudflareCommandPluginType;
    let mockOrchestrator: any;

    beforeEach(() => {
        mockOrchestrator = {
            config: {
                projectPath: '/test/project'
            }
        };
        plugin = new CloudflareCommandPlugin(mockOrchestrator);

        mockFileSystemService.exists.mockReset();
        mockFileSystemService.readFile.mockReset();
        mockFileSystemService.writeFile.mockReset();
    });

    it('should return correct name', () => {
        expect(plugin.getName()).toBe('cloudflare');
    });

    it('should throw if args missing', async () => {
        await expect(plugin.execute(['id'])).rejects.toThrow('Usage: /cloudflare');
    });

    it('should update env vars', async () => {
        mockFileSystemService.exists.mockReturnValue(false);

        await plugin.execute(['id', 'token']);

        expect(mockFileSystemService.writeFile).toHaveBeenCalledWith(
            expect.stringContaining('.env'),
            expect.stringContaining('CLOUDFLARE_ACCOUNT_ID=id')
        );
        expect(mockFileSystemService.writeFile).toHaveBeenCalledWith(
            expect.stringContaining('.env'),
            expect.stringContaining('CLOUDFLARE_API_TOKEN=token')
        );
    });

    it('should update existing keys', async () => {
        mockFileSystemService.exists.mockReturnValue(true);
        mockFileSystemService.readFile.mockResolvedValue('CLOUDFLARE_ACCOUNT_ID=old_id\nCLOUDFLARE_API_TOKEN=old_token\nOTHER=val');

        await plugin.execute(['new_id', 'new_token']);

        expect(mockFileSystemService.writeFile).toHaveBeenCalledWith(
            expect.stringContaining('.env'),
            expect.stringContaining('CLOUDFLARE_ACCOUNT_ID=new_id')
        );
        expect(mockFileSystemService.writeFile).toHaveBeenCalledWith(
            expect.stringContaining('.env'),
            expect.stringContaining('CLOUDFLARE_API_TOKEN=new_token')
        );
        expect(mockFileSystemService.writeFile).toHaveBeenCalledWith(
            expect.stringContaining('.env'),
            expect.stringContaining('OTHER=val')
        );
    });
});
