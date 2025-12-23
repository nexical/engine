
import { jest } from '@jest/globals';
import { AICLIDriver, AISkill } from '../../../../src/drivers/base/AICLIDriver.js';
import { RuntimeHost } from '../../../../src/domain/RuntimeHost.js';
import { ShellExecutor } from '../../../../src/utils/shell.js';

// Mock shell
jest.mock('../../../../src/utils/shell.js');

class TestAIDriver extends AICLIDriver {
    name = 'test-ai';
    description = 'test';
    protected getExecutable(skill: any) { return 'aicmd'; }
    protected getArguments(skill: any) { return ['arg1']; }
}

describe('AICLIDriver', () => {
    let mockHost: jest.Mocked<RuntimeHost>;
    let mockShell: jest.Mocked<ShellExecutor>;

    beforeEach(() => {
        mockHost = { log: jest.fn(), error: jest.fn() } as unknown as jest.Mocked<RuntimeHost>;
    });

    it('should interpolate args', async () => {
        const driver = new TestAIDriver(mockHost);
        mockShell = (driver as any).shell;
        mockShell.execute = jest.fn().mockResolvedValue({ code: 0, stdout: 'ai ok', stderr: '' });

        await driver.run({ name: 'test', prompt_template: 'hi' } as AISkill);
        expect(mockShell.execute).toHaveBeenCalledWith('aicmd', ['arg1'], expect.anything());
    });

    it('should not be supported by default', async () => {
        const driver = new TestAIDriver(mockHost);
        expect(await driver.isSupported()).toBe(false);
    });

    it('should validate schema', () => {
        const driver = new TestAIDriver(mockHost);
        const result = (driver as any).parseSchema({ name: 'test', prompt_template: 'foo' });
        expect(result.success).toBe(true);
    });

    it('should handle missing prompt template', async () => {
        const driver = new TestAIDriver(mockHost);
        mockShell = (driver as any).shell;
        mockShell.execute = jest.fn().mockResolvedValue({ code: 0, stdout: 'ok', stderr: '' });

        await driver.run({ name: 'test' } as any);
        expect(mockShell.execute).toHaveBeenCalled();
    });
});
