import { jest, expect, describe, it, beforeEach, afterEach } from '@jest/globals';
import { HelpCommand } from '../../../src/commands/HelpCommand.js';

describe('HelpCommand', () => {
    let helpPlugin: HelpCommand;
    let mockOrchestrator: any;
    let consoleSpy: any;

    beforeEach(() => {
        mockOrchestrator = {
            commandRegistry: {
                getAll: jest.fn().mockReturnValue([
                    { name: 'help', description: 'Show help' },
                    { name: 'test', description: 'Test command' }
                ])
            }
        };
        helpPlugin = new HelpCommand(mockOrchestrator);
        consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
    });

    afterEach(() => {
        consoleSpy.mockRestore();
    });

    it('should list all available commands', async () => {
        await helpPlugin.execute();

        expect(mockOrchestrator.commandRegistry.getAll).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith('Available Commands:');
        expect(consoleSpy).toHaveBeenCalledWith('  /help - Show help');
        expect(consoleSpy).toHaveBeenCalledWith('  /test - Test command');
    });
});
