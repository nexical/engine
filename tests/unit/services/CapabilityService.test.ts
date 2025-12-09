import { jest, describe, it, expect } from '@jest/globals';

jest.unstable_mockModule('../../../src/utils/shell.js', () => ({
    ShellExecutor: {
        execute: jest.fn(),
        executeSync: jest.fn()
    }
}));

const { CapabilityService } = await import('../../../src/services/CapabilityService.js');
const { ShellExecutor } = await import('../../../src/utils/shell.js');

describe('CapabilityService', () => {
    it('should detect capabilities successfully', async () => {
        (ShellExecutor.execute as jest.Mock<any>).mockResolvedValue('path/to/bin');

        const service = new CapabilityService();
        const capabilities = await service.getCapabilities();

        expect(capabilities.binaries['terraform']).toBe(true);
        expect(capabilities.binaries['docker']).toBe(true);
        expect(capabilities.binaries['node']).toBe(true);
    });

    it('should handle missing binaries', async () => {
        (ShellExecutor.execute as jest.Mock<any>).mockImplementation((cmd: any, args: any[]) => {
            if (args[0] === 'terraform') {
                return Promise.reject(new Error('not found'));
            }
            return Promise.resolve('ok');
        });

        const service = new CapabilityService();
        const capabilities = await service.getCapabilities();

        expect(capabilities.binaries['terraform']).toBe(false);
        expect(capabilities.binaries['docker']).toBe(true);
    });
});
