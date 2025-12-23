import { jest } from '@jest/globals';

const mockShell = {
  executeSync: jest.fn(),
};

const MockShellExecutor = jest.fn().mockReturnValue(mockShell);

jest.unstable_mockModule('../../../src/utils/shell.js', () => ({
  ShellExecutor: MockShellExecutor,
}));

const { GitService } = await import('../../../src/services/GitService.js');

describe('GitService', () => {
  let service: InstanceType<typeof GitService>;
  let mockHost: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockHost = { log: jest.fn() };
    mockShell.executeSync.mockReturnValue({ code: 0, stdout: '', stderr: '' });
    service = new GitService(mockHost, '/root');
  });

  it('should initialize correctly', () => {
    expect(MockShellExecutor).toHaveBeenCalledWith(mockHost);
  });

  it('should init repo', () => {
    service.init();
    expect(mockShell.executeSync).toHaveBeenCalledWith('git', ['init'], expect.objectContaining({ cwd: '/root' }));
  });

  it('should clone repo', async () => {
    await service.clone('http://repo.git', 'dir');
    expect(mockShell.executeSync).toHaveBeenCalledWith('git', ['clone', 'http://repo.git', 'dir'], expect.any(Object));
  });

  it('should clone repo without dir', async () => {
    await service.clone('http://repo.git');
    expect(mockShell.executeSync).toHaveBeenCalledWith('git', ['clone', 'http://repo.git'], expect.any(Object));
  });

  it('should checkout branch', () => {
    service.checkout('main');
    expect(mockShell.executeSync).toHaveBeenCalledWith('git', ['checkout', 'main'], expect.any(Object));
  });

  it('should create and checkout branch', () => {
    service.checkout('feat', true);
    expect(mockShell.executeSync).toHaveBeenCalledWith('git', ['checkout', '-b', 'feat'], expect.any(Object));
  });

  it('should commit', () => {
    service.commit('message');
    expect(mockShell.executeSync).toHaveBeenCalledWith('git', ['commit', '-m', 'message'], expect.any(Object));
  });

  it('should throw on command failure', () => {
    mockShell.executeSync.mockReturnValue({ code: 1, stdout: '', stderr: 'error' });
    expect(() => service.commit('msg')).toThrow('Git command failed');
  });

  it('should return status', () => {
    mockShell.executeSync.mockReturnValue({ code: 0, stdout: ' M file.ts ', stderr: '' });
    expect(service.status()).toBe('M file.ts');
  });

  it('should get current branch', () => {
    mockShell.executeSync.mockReturnValue({ code: 0, stdout: 'main\n', stderr: '' });
    expect(service.getCurrentBranch()).toBe('main');
  });

  it('should add remote', () => {
    service.addRemote('origin', 'url');
    expect(mockShell.executeSync).toHaveBeenCalledWith('git', ['remote', 'add', 'origin', 'url'], expect.any(Object));
  });

  it('should merge branch', () => {
    service.merge('feature');
    expect(mockShell.executeSync).toHaveBeenCalledWith('git', ['merge', 'feature'], expect.any(Object));
  });

  it('should pull', () => {
    service.pull('origin', 'main');
    expect(mockShell.executeSync).toHaveBeenCalledWith('git', ['pull', 'origin', 'main'], expect.any(Object));
  });

  it('should pull with defaults', () => {
    service.pull();
    expect(mockShell.executeSync).toHaveBeenCalledWith('git', ['pull', 'origin', 'main'], expect.any(Object));
  });

  it('should add files', () => {
    service.add('file.ts');
    expect(mockShell.executeSync).toHaveBeenCalledWith('git', ['add', 'file.ts'], expect.any(Object));
  });

  it('should add multiple files', () => {
    service.add(['file1.ts', 'file2.ts']);
    expect(mockShell.executeSync).toHaveBeenCalledWith('git', ['add', 'file1.ts', 'file2.ts'], expect.any(Object));
  });

  it('should push', () => {
    service.push('origin', 'main');
    expect(mockShell.executeSync).toHaveBeenCalledWith('git', ['push', 'origin', 'main'], expect.any(Object));
  });

  it('should push with defaults', () => {
    service.push();
    expect(mockShell.executeSync).toHaveBeenCalledWith('git', ['push', 'origin', 'main'], expect.any(Object));
  });

  it('should delete branch', () => {
    service.deleteBranch('feature');
    expect(mockShell.executeSync).toHaveBeenCalledWith('git', ['branch', '-d', 'feature'], expect.any(Object));
  });

  it('should force delete branch', () => {
    service.deleteBranch('feature', true);
    expect(mockShell.executeSync).toHaveBeenCalledWith('git', ['branch', '-D', 'feature'], expect.any(Object));
  });

  it('should delete remote branch', () => {
    service.pushDelete('origin', 'feature');
    expect(mockShell.executeSync).toHaveBeenCalledWith(
      'git',
      ['push', 'origin', '--delete', 'feature'],
      expect.any(Object),
    );
  });
});
