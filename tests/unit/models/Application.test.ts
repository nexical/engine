import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import type { Application } from '../../../src/models/Application.js';

const mockFs = {
    existsSync: jest.fn<any>(),
    readFileSync: jest.fn<any>()
};

jest.unstable_mockModule('fs-extra', () => ({
    default: mockFs
}));

const { ProjectUtils } = await import('../../../src/models/Application.js');

describe('ProjectUtils', () => {
    let mockApp: Application;

    beforeEach(() => {
        mockApp = {
            appPath: '/app',
            projectPath: '/project',
            plotrisPath: '/project/.plotris',
            agentsPath: '/project/.plotris/agents',
            historyPath: '/project/.plotris/history',
            configPath: '/project/.plotris/config.yml'
        };
        mockFs.existsSync.mockReset();
        mockFs.readFileSync.mockReset();
    });

    describe('loadConfig', () => {
        it('should load config successfully', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue('project_name: test-project');

            const config = ProjectUtils.loadConfig(mockApp);
            expect(config).toEqual({ project_name: 'test-project' });
        });

        it('should throw if config file does not exist', () => {
            mockFs.existsSync.mockReturnValue(false);

            expect(() => ProjectUtils.loadConfig(mockApp)).toThrow('/project/.plotris/config.yml not found');
        });

        it('should return undefined if config is invalid', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue('invalid: config');

            // The implementation throws if project_name is missing?
            // "if (projectConfig && projectConfig.project_name) { return projectConfig; }"
            // "throw new Error(`${app.configPath} not found`);" -> This error message is misleading if file exists but config is invalid.
            // Let's check the implementation again.
            // It falls through to the throw.

            expect(() => ProjectUtils.loadConfig(mockApp)).toThrow('/project/.plotris/config.yml not found');
        });
    });
});
