import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import path from 'path';

// Mock fs-extra
const mockFs = {
    ensureDir: jest.fn<(path: string) => Promise<void>>(),
    pathExists: jest.fn<(path: string) => Promise<boolean>>(),
    remove: jest.fn<(path: string) => Promise<void>>(),
};

jest.unstable_mockModule('fs-extra', () => ({ default: mockFs }));

// Dynamic import after mocking
const { WorkspaceManager } = await import('../../../src/services/WorkspaceManager.js');

describe('WorkspaceManager', () => {
    let workspaceManager: any;
    const baseDir = '/tmp/test-workspaces';

    beforeEach(() => {
        workspaceManager = new WorkspaceManager(baseDir);
        mockFs.ensureDir.mockReset();
        mockFs.pathExists.mockReset();
        mockFs.remove.mockReset();
    });

    describe('constructor', () => {
        it('should use default baseDir if not provided', () => {
            const wm = new WorkspaceManager();
            expect((wm as any).baseDir).toBe('/tmp/workspaces');
        });
    });

    describe('createWorkspace', () => {
        it('should create a directory with job ID', async () => {
            const jobId = '123';
            const expectedPath = path.join(baseDir, 'job-123');

            const result = await workspaceManager.createWorkspace(jobId);

            expect(result).toBe(expectedPath);
            expect(mockFs.ensureDir).toHaveBeenCalledWith(expectedPath);
        });
    });

    describe('cleanupWorkspace', () => {
        it('should remove directory if it exists', async () => {
            const jobId = '123';
            const expectedPath = path.join(baseDir, 'job-123');
            mockFs.pathExists.mockResolvedValue(true);

            await workspaceManager.cleanupWorkspace(jobId);

            expect(mockFs.pathExists).toHaveBeenCalledWith(expectedPath);
            expect(mockFs.remove).toHaveBeenCalledWith(expectedPath);
        });

        it('should do nothing if directory does not exist', async () => {
            const jobId = '123';
            mockFs.pathExists.mockResolvedValue(false);

            await workspaceManager.cleanupWorkspace(jobId);

            expect(mockFs.remove).not.toHaveBeenCalled();
        });
    });

    describe('setupGlobalCache', () => {
        it('should ensure .npm directory exists', async () => {
            await workspaceManager.setupGlobalCache();
            expect(mockFs.ensureDir).toHaveBeenCalledWith('/root/.npm');
        });
    });
});
