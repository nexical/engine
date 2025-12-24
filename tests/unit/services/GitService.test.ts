import { jest } from '@jest/globals';

// Standalone mock variables for ShellExecutor to avoid unbound-method and Jest matcher errors
const mockExecuteSync = jest.fn<(...args: unknown[]) => unknown>();
const mockShell = {
  executeSync: mockExecuteSync,
};

const MockShellExecutor = jest.fn<(...args: unknown[]) => unknown>().mockReturnValue(mockShell);

jest.unstable_mockModule('../../../src/utils/shell.js', () => ({
  ShellExecutor: MockShellExecutor,
}));

import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import type { GitService as GitServiceClass } from '../../../src/services/GitService.js';

const { GitService } = await import('../../../src/services/GitService.js');

describe('GitService', () => {
  let service: GitServiceClass;
  let mockHost: jest.Mocked<IRuntimeHost>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockHost = {
      log: jest.fn<IRuntimeHost['log']>(),
      status: jest.fn<IRuntimeHost['status']>(),
      ask: jest.fn<IRuntimeHost['ask']>(),
      emit: jest.fn<IRuntimeHost['emit']>(),
    };
    mockExecuteSync.mockReturnValue({ code: 0, stdout: '', stderr: '' });
    service = new GitService(mockHost, '/root');
  });

  it('should initialize correctly', () => {
    expect(MockShellExecutor).toHaveBeenCalledWith(mockHost);
  });

  it('should init repo', () => {
    service.init();
    expect(mockExecuteSync).toHaveBeenCalledWith('git', ['init'], expect.objectContaining({ cwd: '/root' }));
  });

  it('should clone repo', async () => {
    await service.clone('http://repo.git', 'dir');
    expect(mockExecuteSync).toHaveBeenCalledWith('git', ['clone', 'http://repo.git', 'dir'], expect.any(Object));
  });

  it('should clone repo without dir', async () => {
    await service.clone('http://repo.git');
    expect(mockExecuteSync).toHaveBeenCalledWith('git', ['clone', 'http://repo.git'], expect.any(Object));
  });

  it('should checkout branch', () => {
    service.checkout('main');
    expect(mockExecuteSync).toHaveBeenCalledWith('git', ['checkout', 'main'], expect.any(Object));
  });

  it('should create and checkout branch', () => {
    service.checkout('feat', true);
    expect(mockExecuteSync).toHaveBeenCalledWith('git', ['checkout', '-b', 'feat'], expect.any(Object));
  });

  it('should commit', () => {
    service.commit('message');
    expect(mockExecuteSync).toHaveBeenCalledWith('git', ['commit', '-m', 'message'], expect.any(Object));
  });

  it('should throw on command failure', () => {
    mockExecuteSync.mockReturnValue({ code: 1, stdout: '', stderr: 'error' });
    expect(() => service.commit('msg')).toThrow('Git command failed');
  });

  it('should return status', () => {
    mockExecuteSync.mockReturnValue({ code: 0, stdout: ' M file.ts ', stderr: '' });
    expect(service.status()).toBe('M file.ts');
  });

  it('should get current branch', () => {
    mockExecuteSync.mockReturnValue({ code: 0, stdout: 'main\n', stderr: '' });
    expect(service.getCurrentBranch()).toBe('main');
  });

  it('should add remote', () => {
    service.addRemote('origin', 'url');
    expect(mockExecuteSync).toHaveBeenCalledWith('git', ['remote', 'add', 'origin', 'url'], expect.any(Object));
  });

  it('should merge branch', () => {
    service.merge('feature');
    expect(mockExecuteSync).toHaveBeenCalledWith('git', ['merge', 'feature'], expect.any(Object));
  });

  it('should pull', () => {
    service.pull('origin', 'main');
    expect(mockExecuteSync).toHaveBeenCalledWith('git', ['pull', 'origin', 'main'], expect.any(Object));
  });

  it('should pull with defaults', () => {
    service.pull();
    expect(mockExecuteSync).toHaveBeenCalledWith('git', ['pull', 'origin', 'main'], expect.any(Object));
  });

  it('should add files', () => {
    service.add('file.ts');
    expect(mockExecuteSync).toHaveBeenCalledWith('git', ['add', 'file.ts'], expect.any(Object));
  });

  it('should add files with specific cwd', () => {
    service.add('file.ts', '/other');
    expect(mockExecuteSync).toHaveBeenCalledWith('git', ['add', 'file.ts'], expect.objectContaining({ cwd: '/other' }));
  });

  it('should add multiple files', () => {
    service.add(['file1.ts', 'file2.ts']);
    expect(mockExecuteSync).toHaveBeenCalledWith('git', ['add', 'file1.ts', 'file2.ts'], expect.any(Object));
  });

  it('should push', () => {
    service.push('origin', 'main');
    expect(mockExecuteSync).toHaveBeenCalledWith('git', ['push', 'origin', 'main'], expect.any(Object));
  });

  it('should push with defaults', () => {
    service.push();
    expect(mockExecuteSync).toHaveBeenCalledWith('git', ['push', 'origin', 'main'], expect.any(Object));
  });

  it('should delete branch', () => {
    service.deleteBranch('feature');
    expect(mockExecuteSync).toHaveBeenCalledWith('git', ['branch', '-d', 'feature'], expect.any(Object));
  });

  it('should force delete branch', () => {
    service.deleteBranch('feature', true);
    expect(mockExecuteSync).toHaveBeenCalledWith('git', ['branch', '-D', 'feature'], expect.any(Object));
  });

  it('should delete remote branch', () => {
    service.pushDelete('origin', 'feature');
    expect(mockExecuteSync).toHaveBeenCalledWith('git', ['push', 'origin', '--delete', 'feature'], expect.any(Object));
  });

  it('should add worktree', () => {
    service.worktreeAdd('/path/to/wt', 'branch');
    expect(mockExecuteSync).toHaveBeenCalledWith(
      'git',
      ['worktree', 'add', '-f', '/path/to/wt', 'branch'],
      expect.any(Object),
    );
  });

  it('should add worktree with base', () => {
    service.worktreeAdd('/path/to/wt', 'branch', 'base');
    expect(mockExecuteSync).toHaveBeenCalledWith(
      'git',
      ['worktree', 'add', '-f', '-b', 'branch', '/path/to/wt', 'base'],
      expect.any(Object),
    );
  });

  it('should remove worktree', () => {
    service.worktreeRemove('/path/to/wt');
    expect(mockExecuteSync).toHaveBeenCalledWith(
      'git',
      ['worktree', 'remove', '-f', '/path/to/wt'],
      expect.any(Object),
    );
  });

  it('should prune worktrees', () => {
    service.worktreePrune();
    expect(mockExecuteSync).toHaveBeenCalledWith('git', ['worktree', 'prune'], expect.any(Object));
  });

  it('should get merge base', () => {
    mockExecuteSync.mockReturnValue({ code: 0, stdout: 'hash', stderr: '' });
    expect(service.mergeBase('main', 'feature')).toBe('hash');
    expect(mockExecuteSync).toHaveBeenCalledWith('git', ['merge-base', 'main', 'feature'], expect.any(Object));
  });

  it('should init sparse checkout', () => {
    service.sparseCheckoutInit('/path');
    expect(mockExecuteSync).toHaveBeenCalledWith(
      'git',
      ['sparse-checkout', 'init', '--cone'],
      expect.objectContaining({ cwd: '/path' }),
    );
  });

  it('should set sparse checkout paths', () => {
    service.sparseCheckoutSet('/path', ['dir1', 'dir2']);
    expect(mockExecuteSync).toHaveBeenCalledWith(
      'git',
      ['sparse-checkout', 'set', 'dir1', 'dir2'],
      expect.objectContaining({ cwd: '/path' }),
    );
  });

  it('should clean stale worktrees', () => {
    service.cleanStaleWorktrees();
    expect(mockExecuteSync).toHaveBeenCalledWith('git', ['worktree', 'prune'], expect.any(Object));
  });

  it('should init submodule', () => {
    service.submoduleInit('/path');
    expect(mockExecuteSync).toHaveBeenCalledWith(
      'git',
      ['submodule', 'init'],
      expect.objectContaining({ cwd: '/path' }),
    );
  });

  it('should update submodule', () => {
    service.submoduleUpdate('/path');
    expect(mockExecuteSync).toHaveBeenCalledWith(
      'git',
      ['submodule', 'update', '--init', '--recursive'],
      expect.objectContaining({ cwd: '/path' }),
    );
  });
});
