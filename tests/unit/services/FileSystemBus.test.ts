/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { jest } from '@jest/globals';

import { IFileSystem } from '../../../src/domain/IFileSystem.js';
import { IProject } from '../../../src/domain/Project.js';
import { FileSystemBus as FileSystemBusType } from '../../../src/services/FileSystemBus.js';

// Mock chokidar

const mockOn = jest.fn<(...args: any[]) => any>();

const mockClose = jest.fn<(...args: any[]) => any>();

const mockWatch = jest.fn<(...args: any[]) => any>().mockReturnValue({
  on: mockOn,
  close: mockClose,
});

jest.unstable_mockModule('chokidar', () => ({
  default: {
    watch: mockWatch,
  },
}));

// Mock uuid
jest.unstable_mockModule('uuid', () => ({
  v4: (): string => 'test-uuid',
}));

const { FileSystemBus } = await import('../../../src/services/FileSystemBus.js');

describe('FileSystemBus', () => {
  let mockProject: jest.Mocked<IProject>;
  let mockFileSystem: {
    exists: jest.Mock;
    readFile: jest.Mock;
    writeFile: jest.Mock;
    deleteFile: jest.Mock;
    appendFile?: jest.Mock;
    move?: jest.Mock;
    copy?: jest.Mock;
    ensureDir?: jest.Mock;
    listFiles?: jest.Mock;
    isDirectory?: jest.Mock;
    readJson?: jest.Mock;
    writeJson?: jest.Mock;
    remove?: jest.Mock;
  };
  let bus: FileSystemBusType;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFileSystem = {
      exists: jest.fn(),
      readFile: jest.fn(),
      writeFile: jest.fn(),
      deleteFile: jest.fn(),
    };
    mockProject = {
      rootDirectory: '/root',
      paths: {
        inbox: '/root/inbox',
        outbox: '/root/outbox',
      },
      fileSystem: mockFileSystem as unknown as IFileSystem,
    } as unknown as jest.Mocked<IProject>;

    bus = new FileSystemBus(mockProject, mockFileSystem as any);
  });

  describe('constructor', () => {
    it('should use default paths if not provided in config', () => {
      const minimalProject = {
        rootDirectory: '/custom-root',
        paths: {},
        fileSystem: mockFileSystem,
      };

      const minimalBus = new FileSystemBus(minimalProject as any, mockFileSystem as unknown as IFileSystem);

      // Test internal paths via watchInbox or sendRequest
      minimalBus.watchInbox(jest.fn<() => Promise<void>>().mockResolvedValue(undefined));
      expect(mockWatch).toHaveBeenCalledWith('/custom-root/.ai/comms/inbox', expect.any(Object));
    });
  });

  const flushPromises = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

  describe('watchInbox', () => {
    it('should start watching inbox path', () => {
      bus.watchInbox(jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined));
      expect(mockWatch).toHaveBeenCalledWith('/root/inbox', expect.any(Object));
      expect(mockOn).toHaveBeenCalledWith('add', expect.any(Function));
    });

    it('should not start multiple watchers', () => {
      bus.watchInbox(jest.fn<() => Promise<void>>().mockResolvedValue(undefined));
      bus.watchInbox(jest.fn<() => Promise<void>>().mockResolvedValue(undefined));
      expect(mockWatch).toHaveBeenCalledTimes(1);
    });

    it('should process added files', async () => {
      const handler = jest.fn<() => Promise<void>>().mockResolvedValue();
      bus.watchInbox(handler);

      const addHandlerCall = mockOn.mock.calls.find((call: any) => call[0] === 'add');
      const addHandler = addHandlerCall?.[1] as (p: string) => void;

      const message = { id: 'msg1', source: 'test', payload: {} };
      mockFileSystem.exists.mockReturnValue(true);
      mockFileSystem.readFile.mockReturnValue(JSON.stringify(message));

      addHandler('/root/inbox/file.json');
      await flushPromises();

      expect(mockFileSystem.readFile).toHaveBeenCalledWith('/root/inbox/file.json');
      expect(handler).toHaveBeenCalledWith(message);
      expect(mockFileSystem.deleteFile).toHaveBeenCalledWith('/root/inbox/file.json');
    });

    it('should skip if file does not exist when handler is called', async () => {
      bus.watchInbox(jest.fn<(m: any) => Promise<void>>().mockResolvedValue(undefined as any));

      const addHandlerCall = mockOn.mock.calls.find((call: any) => call[0] === 'add');

      const addHandler = addHandlerCall?.[1] as (p: string) => void;
      mockFileSystem.exists.mockReturnValue(false);

      addHandler('/root/inbox/missing.json');
      await flushPromises();

      expect(mockFileSystem.readFile).not.toHaveBeenCalled();
    });

    it('should handle handler errors gracefully', async () => {
      const handler = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('handler fail'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      bus.watchInbox(handler);

      const addHandlerCall = mockOn.mock.calls.find((call: any) => call[0] === 'add');
      const addHandler = addHandlerCall?.[1] as (p: string) => void;
      mockFileSystem.exists.mockReturnValue(true);
      mockFileSystem.readFile.mockReturnValue('{}');

      addHandler('/root/inbox/error.json');
      await flushPromises();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('stop', () => {
    it('should stop watcher if running', () => {
      bus.watchInbox(jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined));
      void bus.stop();
      expect(mockClose).toHaveBeenCalled();
    });

    it('should do nothing if not running', () => {
      void bus.stop();
      expect(mockClose).not.toHaveBeenCalled();
    });
  });

  describe('sendRequest', () => {
    it('should write request file to inbox', () => {
      const message = { id: 'req1', source: 'planner', payload: { task: 'go' } };
      bus.sendRequest(message);

      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('/root/inbox/req_planner_req1.json'),
        expect.stringContaining('"id": "req1"'),
      );
    });

    it('should use correlationId in filename if available', () => {
      const message = { id: 'req1', correlationId: 'corr1', source: 'planner', payload: {} };
      bus.sendRequest(message);
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('req_planner_corr1.json'),
        expect.any(String),
      );
    });
  });

  describe('sendResponse', () => {
    it('should write response file to outbox', () => {
      bus.sendResponse('corr1', { result: 'ok' });
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('/root/outbox/res_architect_corr1.json'),
        expect.stringContaining('"correlationId": "corr1"'),
      );
    });
  });

  describe('waitForResponse', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should poll until response file exists', async () => {
      const promise = bus.waitForResponse('corr1', 5000);

      mockFileSystem.exists.mockReturnValueOnce(false).mockReturnValueOnce(true);
      mockFileSystem.readFile.mockReturnValue(JSON.stringify({ id: 'res1', payload: { x: 1 } }));

      // Trigger first poll
      await jest.advanceTimersByTimeAsync(500); // Poll 1
      await jest.advanceTimersByTimeAsync(500); // Poll 2

      const result = await promise;
      expect(result.id).toBe('res1');
      expect(mockFileSystem.deleteFile).toHaveBeenCalled();
    });

    it('should throw on timeout', async () => {
      const promise = bus.waitForResponse('corr1', 1000);
      mockFileSystem.exists.mockReturnValue(false);

      // Advance past timeout
      const pollTask = async (): Promise<void> => {
        await jest.advanceTimersByTimeAsync(500);
        await jest.advanceTimersByTimeAsync(500);
        await jest.advanceTimersByTimeAsync(500);
      };

      void pollTask();

      await expect(promise).rejects.toThrow('Timeout waiting for response');
    });

    it('should ignore read errors and continue polling', async () => {
      const promise = bus.waitForResponse('corr1', 5000);

      mockFileSystem.exists.mockReturnValue(true);
      mockFileSystem.readFile
        .mockImplementationOnce(() => {
          throw new Error('corrupt');
        })
        .mockReturnValueOnce(JSON.stringify({ id: 'ok' }));

      await jest.advanceTimersByTimeAsync(500); // Poll 1 (err)
      await jest.advanceTimersByTimeAsync(500); // Poll 2 (ok)

      const result = await promise;
      expect(result.id).toBe('ok');
    });

    it('should use default timeout of 60s', async () => {
      mockFileSystem.exists.mockReturnValue(false);
      const promise = bus.waitForResponse('corr_default');

      // Catch error to avoid unhandled rejection during advancement
      const capturedErrorPromise = promise.catch((err: Error) => err);

      // Advance timers in chunks to ensure the while loop condition and setTimeout resolve
      for (let i = 0; i < 121; i++) {
        await jest.advanceTimersByTimeAsync(500);
      }

      const error = await capturedErrorPromise;
      expect((error as Error).message).toBe('Timeout waiting for response to correlationId: corr_default');
    });
  });
});
