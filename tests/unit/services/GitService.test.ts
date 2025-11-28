import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import type { GitService as GitServiceType } from '../../../src/services/GitService.js';

const mockSpawnSync = jest.fn();

jest.unstable_mockModule('child_process', () => ({
    spawnSync: mockSpawnSync,
}));

const { GitService } = await import('../../../src/services/GitService.js');

describe('GitService', () => {
    let gitService: GitServiceType;
    let mockOrchestrator: any;

    beforeEach(() => {
        mockOrchestrator = {
            config: {
                projectPath: '/test/project'
            }
        };
        gitService = new GitService(mockOrchestrator);
        mockSpawnSync.mockReset();
    });

    describe('runCommand', () => {
        it('should run a git command successfully', () => {
            mockSpawnSync.mockReturnValue({
                status: 0,
                stdout: 'output\n',
                stderr: ''
            });

            const result = gitService.runCommand(['status']);
            expect(result).toBe('output');
            expect(mockSpawnSync).toHaveBeenCalledWith('git', ['status'], expect.objectContaining({
                cwd: '/test/project',
                encoding: 'utf-8'
            }));
        });

        it('should throw error on failure', () => {
            mockSpawnSync.mockReturnValue({
                status: 1,
                stdout: '',
                stderr: 'error'
            });

            expect(() => gitService.runCommand(['status'])).toThrow('Git command failed: git status\nerror');
        });
    });

    describe('commit', () => {
        it('should add and commit files', () => {
            mockSpawnSync.mockReturnValue({
                status: 0,
                stdout: '',
                stderr: ''
            });

            gitService.commit('message');

            expect(mockSpawnSync).toHaveBeenCalledWith('git', ['add', '.'], expect.any(Object));
            expect(mockSpawnSync).toHaveBeenCalledWith('git', ['commit', '-m', 'message'], expect.any(Object));
        });
    });

    describe('push', () => {
        it('should push to remote', () => {
            mockSpawnSync.mockReturnValue({
                status: 0,
                stdout: '',
                stderr: ''
            });

            gitService.push('origin', 'main');

            expect(mockSpawnSync).toHaveBeenCalledWith('git', ['push', 'origin', 'main'], expect.any(Object));
        });

        it('should push with default args', () => {
            mockSpawnSync.mockReturnValue({
                status: 0,
                stdout: '',
                stderr: ''
            });

            gitService.push();

            expect(mockSpawnSync).toHaveBeenCalledWith('git', ['push', 'origin', 'main'], expect.any(Object));
        });
    });

    describe('getCurrentBranch', () => {
        it('should return current branch', () => {
            mockSpawnSync.mockReturnValue({
                status: 0,
                stdout: 'main\n',
                stderr: ''
            });

            const branch = gitService.getCurrentBranch();
            expect(branch).toBe('main');
            expect(mockSpawnSync).toHaveBeenCalledWith('git', ['rev-parse', '--abbrev-ref', 'HEAD'], expect.any(Object));
        });
    });
});
