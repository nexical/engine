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

    describe('init', () => {
        it('should run git init', () => {
            mockSpawnSync.mockReturnValue({
                status: 0,
                stdout: '',
                stderr: ''
            });
            gitService.init();
            expect(mockSpawnSync).toHaveBeenCalledWith('git', ['init'], expect.any(Object));
        });
    });

    describe('clone', () => {
        it('should run git clone', () => {
            mockSpawnSync.mockReturnValue({
                status: 0,
                stdout: '',
                stderr: ''
            });
            gitService.clone('url', 'dir');
            expect(mockSpawnSync).toHaveBeenCalledWith('git', ['clone', 'url', 'dir'], expect.objectContaining({ cwd: '.' }));
        });

        it('should run git clone without dir', () => {
            mockSpawnSync.mockReturnValue({
                status: 0,
                stdout: '',
                stderr: ''
            });
            gitService.clone('url');
            expect(mockSpawnSync).toHaveBeenCalledWith('git', ['clone', 'url'], expect.objectContaining({ cwd: '.' }));
        });
    });

    describe('addRemote', () => {
        it('should run git remote add', () => {
            mockSpawnSync.mockReturnValue({
                status: 0,
                stdout: '',
                stderr: ''
            });
            gitService.addRemote('origin', 'url');
            expect(mockSpawnSync).toHaveBeenCalledWith('git', ['remote', 'add', 'origin', 'url'], expect.any(Object));
        });
    });

    describe('checkout', () => {
        it('should run git checkout', () => {
            mockSpawnSync.mockReturnValue({
                status: 0,
                stdout: '',
                stderr: ''
            });
            gitService.checkout('branch');
            expect(mockSpawnSync).toHaveBeenCalledWith('git', ['checkout', 'branch'], expect.any(Object));
        });

        it('should run git checkout -b', () => {
            mockSpawnSync.mockReturnValue({
                status: 0,
                stdout: '',
                stderr: ''
            });
            gitService.checkout('branch', true);
            expect(mockSpawnSync).toHaveBeenCalledWith('git', ['checkout', '-b', 'branch'], expect.any(Object));
        });
    });

    describe('merge', () => {
        it('should run git merge', () => {
            mockSpawnSync.mockReturnValue({
                status: 0,
                stdout: '',
                stderr: ''
            });
            gitService.merge('branch');
            expect(mockSpawnSync).toHaveBeenCalledWith('git', ['merge', 'branch'], expect.any(Object));
        });
    });

    describe('pull', () => {
        it('should run git pull', () => {
            mockSpawnSync.mockReturnValue({
                status: 0,
                stdout: '',
                stderr: ''
            });
            gitService.pull('origin', 'main');
            expect(mockSpawnSync).toHaveBeenCalledWith('git', ['pull', 'origin', 'main'], expect.any(Object));
        });

        it('should run git pull with defaults', () => {
            mockSpawnSync.mockReturnValue({
                status: 0,
                stdout: '',
                stderr: ''
            });
            gitService.pull();
            expect(mockSpawnSync).toHaveBeenCalledWith('git', ['pull', 'origin', 'main'], expect.any(Object));
        });
    });

    describe('add', () => {
        it('should run git add', () => {
            mockSpawnSync.mockReturnValue({
                status: 0,
                stdout: '',
                stderr: ''
            });
            gitService.add('file');
            expect(mockSpawnSync).toHaveBeenCalledWith('git', ['add', 'file'], expect.any(Object));
        });

        it('should run git add multiple', () => {
            mockSpawnSync.mockReturnValue({
                status: 0,
                stdout: '',
                stderr: ''
            });
            gitService.add(['file1', 'file2']);
            expect(mockSpawnSync).toHaveBeenCalledWith('git', ['add', 'file1', 'file2'], expect.any(Object));
        });
    });

    describe('status', () => {
        it('should run git status', () => {
            mockSpawnSync.mockReturnValue({
                status: 0,
                stdout: 'M file.txt',
                stderr: ''
            });
            const status = gitService.status();
            expect(status).toBe('M file.txt');
            expect(mockSpawnSync).toHaveBeenCalledWith('git', ['status', '--porcelain'], expect.any(Object));
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
