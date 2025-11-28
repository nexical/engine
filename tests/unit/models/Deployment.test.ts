import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import type { DeployUtils as DeployUtilsType } from '../../../src/models/Deployment.js';

const mockFs = {
    existsSync: jest.fn(),
    readFileSync: jest.fn()
};

jest.unstable_mockModule('fs-extra', () => ({
    default: mockFs,
    ...mockFs
}));

const { DeployUtils } = await import('../../../src/models/Deployment.js');

describe('DeployUtils', () => {
    let mockConfig: any;

    beforeEach(() => {
        mockConfig = {
            deployConfigPath: '/path/to/deploy.yml'
        };
        mockFs.existsSync.mockReset();
        mockFs.readFileSync.mockReset();
    });

    describe('loadConfig', () => {
        it('should load valid config', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue('project_name: test-project\nproduction_domain: example.com');

            const config = DeployUtils.loadConfig(mockConfig);

            expect(config).toEqual({
                project_name: 'test-project',
                production_domain: 'example.com'
            });
            expect(mockFs.existsSync).toHaveBeenCalledWith('/path/to/deploy.yml');
            expect(mockFs.readFileSync).toHaveBeenCalledWith('/path/to/deploy.yml', 'utf-8');
        });

        it('should throw if file does not exist', () => {
            mockFs.existsSync.mockReturnValue(false);

            expect(() => DeployUtils.loadConfig(mockConfig)).toThrow('/path/to/deploy.yml not found');
        });

        it('should throw if config is invalid (missing project_name)', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue('production_domain: example.com');

            expect(() => DeployUtils.loadConfig(mockConfig)).toThrow();
        });
    });
});
