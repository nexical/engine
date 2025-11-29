import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import type { ConfigCommandPlugin as ConfigCommandPluginType } from '../../../../src/plugins/commands/ConfigCommandPlugin.js';

const mockFileSystemService = {
    exists: jest.fn<any>(),
    readFile: jest.fn<any>(),
    writeFile: jest.fn<any>()
};

jest.unstable_mockModule('../../../../src/services/FileSystemService.js', () => ({
    FileSystemService: jest.fn().mockImplementation(() => mockFileSystemService)
}));

const { ConfigCommandPlugin } = await import('../../../../src/plugins/commands/ConfigCommandPlugin.js');

describe('ConfigCommandPlugin', () => {
    let plugin: ConfigCommandPluginType;
    let mockOrchestrator: any;

    beforeEach(() => {
        mockOrchestrator = {
            config: {
                projectPath: '/test/project'
            }
        };
        plugin = new ConfigCommandPlugin(mockOrchestrator);

        mockFileSystemService.exists.mockReset();
        mockFileSystemService.readFile.mockReset();
        mockFileSystemService.writeFile.mockReset();
    });

    it('should return correct name', () => {
        expect(plugin.getName()).toBe('config');
    });

    it('should handle empty config file', async () => {
        mockFileSystemService.exists.mockReturnValue(true);
        mockFileSystemService.readFile.mockResolvedValue(''); // Empty file

        const result = await plugin.execute([]);
        expect(result).toBe('{}\n');
    });

    it('should throw if config file not found', async () => {
        mockFileSystemService.exists.mockReturnValue(false);
        await expect(plugin.execute([])).rejects.toThrow('Configuration file not found');
    });

    it('should return all config if no args', async () => {
        mockFileSystemService.exists.mockReturnValue(true);
        mockFileSystemService.readFile.mockResolvedValue('key: value');

        const result = await plugin.execute([]);
        expect(result).toContain('key: value');
    });

    it('should return specific config value', async () => {
        mockFileSystemService.exists.mockReturnValue(true);
        mockFileSystemService.readFile.mockResolvedValue('key: value');

        const result = await plugin.execute(['key']);
        expect(result).toBe('value');
    });

    it('should return undefined for missing key', async () => {
        mockFileSystemService.exists.mockReturnValue(true);
        mockFileSystemService.readFile.mockResolvedValue('key: value');

        const result = await plugin.execute(['other']);
        expect(result).toBe('undefined');
    });

    it('should set config value', async () => {
        mockFileSystemService.exists.mockReturnValue(true);
        mockFileSystemService.readFile.mockResolvedValue('key: value');

        await plugin.execute(['key', 'newvalue']);

        expect(mockFileSystemService.writeFile).toHaveBeenCalledWith(
            expect.stringContaining('config.yml'),
            expect.stringContaining('key')
        );
        expect(mockFileSystemService.writeFile).toHaveBeenCalledWith(
            expect.stringContaining('config.yml'),
            expect.stringContaining('newvalue')
        );
    });
});
