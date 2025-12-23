import { jest } from '@jest/globals';

import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { ShellExecutor as ShellExecutorClass } from '../../../src/utils/shell.js';

const mockChild = {
  stdout: { on: jest.fn() },
  stderr: { on: jest.fn() },
  on: jest.fn(),
};
const mockSpawn = jest.fn().mockReturnValue(mockChild);
const mockSpawnSync = jest.fn(); // Replaced per test

jest.unstable_mockModule('child_process', () => ({
  spawn: mockSpawn,
  spawnSync: mockSpawnSync,
  default: { spawn: mockSpawn, spawnSync: mockSpawnSync },
}));

const shellModule = import('../../../src/utils/shell.js');

describe('ShellExecutor', () => {
  let ShellExecutor: typeof ShellExecutorClass;
  let shell: ShellExecutorClass;
  let mockHost: jest.Mocked<IRuntimeHost>;

  beforeEach(async () => {
    jest.clearAllMocks();
    ShellExecutor = (await shellModule).ShellExecutor;
    mockHost = {
      log: jest.fn(),
      status: jest.fn(),
      ask: jest.fn(),
      emit: jest.fn(),
    } as unknown as jest.Mocked<IRuntimeHost>;
    shell = new ShellExecutor(mockHost);
    mockSpawn.mockClear();
    mockChild.on.mockClear();
    mockChild.stdout.on.mockClear();
    mockChild.stderr.on.mockClear();
    // Restore default mock return for mockSpawn
    mockSpawn.mockReturnValue(mockChild);
  });

  describe('execute', () => {
    it('should execute command successfully', async () => {
      const promise = shell.execute('cmd', ['arg']);

      // Simulate process events
      const calls = (mockChild.on as jest.Mock).mock.calls as [string, (arg?: unknown) => void][];
      const closeHandler = calls.find((c) => c[0] === 'close')?.[1] as (arg?: unknown) => void;
      if (closeHandler) closeHandler(0);

      const result = await promise;
      expect(result.code).toBe(0);
      expect(mockHost.log).toHaveBeenCalledWith('debug', expect.stringContaining('Executing'));
    });

    it('should handle stdout/stderr data', async () => {
      const promise = shell.execute('cmd', [], { streamStdio: true });

      // Simulate stdout
      const stdoutHandler = ((mockChild.stdout.on as jest.Mock).mock.calls as [string, (arg?: unknown) => void][]).find(
        (c) => c[0] === 'data',
      )?.[1] as (arg?: unknown) => void;
      if (stdoutHandler) stdoutHandler(Buffer.from('out'));

      // Simulate stderr
      const stderrHandler = ((mockChild.stderr.on as jest.Mock).mock.calls as [string, (arg?: unknown) => void][]).find(
        (c) => c[0] === 'data',
      )?.[1] as (arg?: unknown) => void;
      if (stderrHandler) stderrHandler(Buffer.from('err'));

      const closeHandler = ((mockChild.on as jest.Mock).mock.calls as [string, (arg?: unknown) => void][]).find(
        (c) => c[0] === 'close',
      )?.[1] as (arg?: unknown) => void;
      if (closeHandler) closeHandler(0);

      const result = await promise;
      expect(result.stdout).toBe('out');
      expect(result.stderr).toBe('err');
      // Check streaming logs
      expect(mockHost.log).toHaveBeenCalledWith('info', 'out');
      expect(mockHost.log).toHaveBeenCalledWith('error', 'err');
    });

    it('should handle process error', async () => {
      const promise = shell.execute('cmd');

      const errorHandler = ((mockChild.on as jest.Mock).mock.calls as [string, (arg?: unknown) => void][]).find(
        (c) => c[0] === 'error',
      )?.[1] as (arg?: unknown) => void;
      if (errorHandler) errorHandler(new Error('fail'));

      await expect(promise).rejects.toThrow('fail');
      expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Command failed'));
    });

    it('should handle missing stdout/stderr streams', async () => {
      // Mock spawn to return a child without stdout/stderr
      mockSpawn.mockReturnValueOnce({ on: mockChild.on });

      const promise = shell.execute('cmd');

      const closeHandler = ((mockChild.on as jest.Mock).mock.calls as [string, (arg?: unknown) => void][]).find(
        (c) => c[0] === 'close',
      )?.[1] as (arg?: unknown) => void;
      if (closeHandler) closeHandler(0);

      const result = await promise;
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
    });

    it('should handle data without streaming', async () => {
      const promise = shell.execute('cmd', [], { streamStdio: false });

      const stdoutHandler = ((mockChild.stdout.on as jest.Mock).mock.calls as [string, (arg?: unknown) => void][]).find(
        (c) => c[0] === 'data',
      )?.[1] as (arg?: unknown) => void;
      if (stdoutHandler) stdoutHandler(Buffer.from('out'));

      const stderrHandler = ((mockChild.stderr.on as jest.Mock).mock.calls as [string, (arg?: unknown) => void][]).find(
        (c) => c[0] === 'data',
      )?.[1] as (arg?: unknown) => void;
      if (stderrHandler) stderrHandler(Buffer.from('err'));

      const closeHandler = ((mockChild.on as jest.Mock).mock.calls as [string, (arg?: unknown) => void][]).find(
        (c) => c[0] === 'close',
      )?.[1] as (arg?: unknown) => void;
      if (closeHandler) closeHandler(0);

      const result = await promise;
      expect(result.stdout).toBe('out');
      expect(result.stderr).toBe('err');
      expect(mockHost.log).not.toHaveBeenCalledWith('info', expect.anything());
      expect(mockHost.log).not.toHaveBeenCalledWith('error', expect.anything());
    });
  });

  describe('executeSync', () => {
    it('should execute sync command', () => {
      mockSpawnSync.mockReturnValue({ status: 0, stdout: Buffer.from('out'), stderr: Buffer.from('') });
      const result = shell.executeSync('cmd');
      expect(result.code).toBe(0);
      expect(result.stdout).toBe('out');
    });

    it('should handle sync error', () => {
      mockSpawnSync.mockReturnValue({ error: new Error('fail') });
      expect(() => shell.executeSync('cmd')).toThrow('fail');
    });

    it('should handle null stdout/stderr in sync mode', () => {
      mockSpawnSync.mockReturnValue({ status: 1, stdout: null, stderr: null });
      const result = shell.executeSync('cmd');
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
      expect(result.code).toBe(1);
    });
  });
});
