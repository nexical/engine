import { jest, expect, describe, it, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';

// Mock child_process using unstable_mockModule
const mockSpawn = jest.fn();
const mockSpawnSync = jest.fn();

jest.unstable_mockModule('child_process', () => ({
    spawn: mockSpawn,
    spawnSync: mockSpawnSync,
}));

// Import ShellExecutor AFTER mocking
const { ShellExecutor } = await import('../../../src/utils/shell.js');

describe('ShellExecutor', () => {
    beforeEach(() => {
        mockSpawn.mockReset();
        mockSpawnSync.mockReset();

        const mockChildProcess = new EventEmitter() as any;
        mockChildProcess.stdout = new EventEmitter();
        mockChildProcess.stderr = new EventEmitter();
        mockSpawn.mockReturnValue(mockChildProcess);
    });

    describe('execute', () => {
        it('should execute a command and return stdout/stderr', async () => {
            const mockChildProcess = new EventEmitter() as any;
            mockChildProcess.stdout = new EventEmitter();
            mockChildProcess.stderr = new EventEmitter();

            mockSpawn.mockReturnValue(mockChildProcess);

            const promise = ShellExecutor.execute('echo', ['hello']);

            // Simulate output
            mockChildProcess.stdout.emit('data', Buffer.from('hello output'));
            mockChildProcess.stderr.emit('data', Buffer.from('error output'));

            // Simulate exit
            mockChildProcess.emit('close', 0);

            const result = await promise;

            expect(result.stdout).toBe('hello output');
            expect(result.stderr).toBe('error output');
            expect(result.code).toBe(0);
            expect(mockSpawn).toHaveBeenCalledWith('echo', ['hello'], expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] }));
        });

        it('should handle command errors', async () => {
            const mockChildProcess = new EventEmitter() as any;
            mockChildProcess.stdout = new EventEmitter();
            mockChildProcess.stderr = new EventEmitter();

            mockSpawn.mockReturnValue(mockChildProcess);

            const promise = ShellExecutor.execute('invalid', []);

            const error = new Error('Command failed');
            mockChildProcess.emit('error', error);

            await expect(promise).rejects.toThrow('Command failed');
        });

        it('should stream stdio if requested', async () => {
            const mockChildProcess = new EventEmitter() as any;
            mockChildProcess.stdout = new EventEmitter();
            mockChildProcess.stderr = new EventEmitter();

            mockSpawn.mockReturnValue(mockChildProcess);

            const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
            const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

            const promise = ShellExecutor.execute('echo', ['hello'], { streamStdio: true });

            mockChildProcess.stdout.emit('data', Buffer.from('out'));
            mockChildProcess.stderr.emit('data', Buffer.from('err'));
            mockChildProcess.emit('close', 0);

            await promise;

            expect(stdoutSpy).toHaveBeenCalledWith('out');
            expect(stderrSpy).toHaveBeenCalledWith('err');
            expect(mockSpawn).toHaveBeenCalledWith('echo', ['hello'], expect.objectContaining({ stdio: ['inherit', 'pipe', 'pipe'] }));

            stdoutSpy.mockRestore();
            stderrSpy.mockRestore();
        });

        it('should handle signal exit', async () => {
            const mockChildProcess = new EventEmitter() as any;
            mockChildProcess.stdout = new EventEmitter();
            mockChildProcess.stderr = new EventEmitter();

            mockSpawn.mockReturnValue(mockChildProcess);

            const promise = ShellExecutor.execute('sleep', ['10']);

            mockChildProcess.stdout.emit('data', Buffer.from(''));
            mockChildProcess.stderr.emit('data', Buffer.from(''));
            mockChildProcess.emit('close', null, 'SIGTERM');

            const result = await promise;
            expect(result.code).toBe(null);
        });
        it('should handle missing stdout/stderr streams', async () => {
            const mockChildProcess = new EventEmitter() as any;
            // No stdout/stderr properties
            mockSpawn.mockReturnValue(mockChildProcess);

            const promise = ShellExecutor.execute('cmd', []);
            mockChildProcess.emit('close', 0);

            const result = await promise;
            expect(result.stdout).toBe('');
            expect(result.stderr).toBe('');
        });

        it('should use default arguments', async () => {
            const mockChildProcess = new EventEmitter() as any;
            mockChildProcess.stdout = new EventEmitter();
            mockChildProcess.stderr = new EventEmitter();
            mockSpawn.mockReturnValue(mockChildProcess);

            const promise = ShellExecutor.execute('cmd');
            mockChildProcess.emit('close', 0);
            await promise;

            expect(mockSpawn).toHaveBeenCalledWith('cmd', [], expect.any(Object));
        });
    });

    describe('executeSync', () => {
        beforeEach(() => {
            mockSpawnSync.mockReset();
        });

        it('should execute a command synchronously', () => {
            mockSpawnSync.mockReturnValue({
                stdout: 'sync out',
                stderr: 'sync err',
                status: 0
            } as any);

            const result = ShellExecutor.executeSync('echo', ['sync']);

            expect(result.stdout).toBe('sync out');
            expect(result.stderr).toBe('sync err');
            expect(result.code).toBe(0);
            expect(mockSpawnSync).toHaveBeenCalledWith('echo', ['sync'], expect.objectContaining({ encoding: 'utf-8' }));
        });

        it('should handle null stdout/stderr', () => {
            mockSpawnSync.mockReturnValue({
                stdout: null,
                stderr: null,
                status: 1
            } as any);

            const result = ShellExecutor.executeSync('fail', []);

            expect(result.stdout).toBe('');
            expect(result.stderr).toBe('');
            expect(result.code).toBe(1);
        });

        it('should throw on spawn error', () => {
            mockSpawnSync.mockReturnValue({
                error: new Error('Spawn failed'),
                status: null
            } as any);

            expect(() => ShellExecutor.executeSync('fail', [])).toThrow('Spawn failed');
        });

        it('should use default arguments', () => {
            mockSpawnSync.mockReturnValue({
                stdout: '',
                stderr: '',
                status: 0
            } as any);

            ShellExecutor.executeSync('cmd');

            expect(mockSpawnSync).toHaveBeenCalledWith('cmd', [], expect.any(Object));
        });
    });
});
