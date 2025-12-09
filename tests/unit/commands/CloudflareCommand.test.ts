import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import { CloudflareCommand } from '../../../src/commands/CloudflareCommand.js';

describe('CloudflareCommand', () => {
    let plugin: CloudflareCommand;
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
        plugin = new CloudflareCommand(mockOrchestrator);

        // Mock console.error/log to keep output clean
        jest.spyOn(console, 'error').mockImplementation(() => { });
        jest.spyOn(console, 'log').mockImplementation(() => { });
    });

    it('should have correct name', () => {
        expect(plugin.name).toBe('cloudflare');
    });

    it('should log error if args missing', async () => {
        await plugin.execute(['id']);
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Usage: /cloudflare'));
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
