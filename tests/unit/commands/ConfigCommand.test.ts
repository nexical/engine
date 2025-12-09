import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import { ConfigCommand } from '../../../src/commands/ConfigCommand.js';

describe('ConfigCommand', () => {
    let plugin: ConfigCommand;
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
        plugin = new ConfigCommand(mockOrchestrator);

        // Mock console.error/log
        jest.spyOn(console, 'error').mockImplementation(() => { });
        jest.spyOn(console, 'log').mockImplementation(() => { });
    });

    it('should have correct name', () => {
        expect(plugin.name).toBe('config');
    });

    it('should handle empty config file', async () => {
        mockFileSystemService.exists.mockReturnValue(true);
        mockFileSystemService.readFile.mockResolvedValue(''); // Empty file

        await plugin.execute([]);
        expect(console.log).toHaveBeenCalledWith('{}\n');
    });

    it('should log error if config file not found', async () => {
        mockFileSystemService.exists.mockReturnValue(false);
        await plugin.execute([]);
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Configuration file not found'));
    });

    it('should log all config if no args', async () => {
        mockFileSystemService.exists.mockReturnValue(true);
        mockFileSystemService.readFile.mockResolvedValue('key: value');

        await plugin.execute([]);
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('key: value'));
    });

    it('should log specific config value', async () => {
        mockFileSystemService.exists.mockReturnValue(true);
        mockFileSystemService.readFile.mockResolvedValue('key: value');

        await plugin.execute(['key']);
        expect(console.log).toHaveBeenCalledWith('value');
    });

    it('should log undefined for missing key', async () => {
        mockFileSystemService.exists.mockReturnValue(true);
        mockFileSystemService.readFile.mockResolvedValue('key: value');

        await plugin.execute(['other']);
        expect(console.log).toHaveBeenCalledWith('undefined');
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
