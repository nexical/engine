import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import type { OpenRouterCommandPlugin as OpenRouterCommandPluginType } from '../../../../src/plugins/commands/OpenRouterCommandPlugin.js';

const mockFileSystemService = {
    exists: jest.fn<any>(),
    readFile: jest.fn<any>(),
    writeFile: jest.fn<any>()
};

jest.unstable_mockModule('../../../../src/services/FileSystemService.js', () => ({
    FileSystemService: jest.fn().mockImplementation(() => mockFileSystemService)
}));

const { OpenRouterCommandPlugin } = await import('../../../../src/plugins/commands/OpenRouterCommandPlugin.js');

describe('OpenRouterCommandPlugin', () => {
    let plugin: OpenRouterCommandPluginType;
    let mockOrchestrator: any;

    beforeEach(() => {
        mockOrchestrator = {
            config: {
                projectPath: '/test/project'
            }
        };
        plugin = new OpenRouterCommandPlugin(mockOrchestrator);

        mockFileSystemService.exists.mockReset();
        mockFileSystemService.readFile.mockReset();
        mockFileSystemService.writeFile.mockReset();
    });

    it('should return correct name', () => {
        expect(plugin.getName()).toBe('openrouter');
    });

    it('should throw if args missing', async () => {
        await expect(plugin.execute([])).rejects.toThrow('Usage: /openrouter');
    });

    it('should create new env file if not exists', async () => {
        mockFileSystemService.exists.mockReturnValue(false);

        await plugin.execute(['key']);

        expect(mockFileSystemService.writeFile).toHaveBeenCalledWith(
            expect.stringContaining('.env'),
            'OPENROUTER_API_KEY=key'
        );
    });

    it('should update existing key', async () => {
        mockFileSystemService.exists.mockReturnValue(true);
        mockFileSystemService.readFile.mockResolvedValue('OPENROUTER_API_KEY=old');

        await plugin.execute(['new']);

        expect(mockFileSystemService.writeFile).toHaveBeenCalledWith(
            expect.stringContaining('.env'),
            'OPENROUTER_API_KEY=new'
        );
    });

    it('should append key if not present', async () => {
        mockFileSystemService.exists.mockReturnValue(true);
        mockFileSystemService.readFile.mockResolvedValue('OTHER=val');

        await plugin.execute(['key']);

        expect(mockFileSystemService.writeFile).toHaveBeenCalledWith(
            expect.stringContaining('.env'),
            'OTHER=val\nOPENROUTER_API_KEY=key'
        );
    });
});
