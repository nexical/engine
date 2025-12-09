import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import { OpenRouterCommand } from '../../../src/commands/OpenRouterCommand.js';

describe('OpenRouterCommand', () => {
    let plugin: OpenRouterCommand;
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
        plugin = new OpenRouterCommand(mockOrchestrator);

        // Mock console.error/log
        jest.spyOn(console, 'error').mockImplementation(() => { });
        jest.spyOn(console, 'log').mockImplementation(() => { });
    });

    it('should have correct name', () => {
        expect(plugin.name).toBe('openrouter');
    });

    it('should log error if args missing', async () => {
        await plugin.execute([]);
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Usage: /openrouter'));
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
