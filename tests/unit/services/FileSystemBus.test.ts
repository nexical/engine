import { jest } from '@jest/globals';

import { IFileSystem } from '../../../src/domain/IFileSystem.js';
import { IProject } from '../../../src/domain/Project.js';
import { FileSystemBus as FileSystemBusType, IBusMessage } from '../../../src/services/FileSystemBus.js';

// Mock chokidar
const mockOn = jest.fn<(...args: unknown[]) => unknown>().mockReturnThis();
const mockClose = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

const mockWatch = jest.fn<(...args: unknown[]) => unknown>().mockReturnValue({
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
  let mockFileSystem: jest.Mocked<IFileSystem>;
  let bus: FileSystemBusType;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFileSystem = {
      exists: jest.fn<IFileSystem['exists']>().mockResolvedValue(false),
      readFile: jest.fn<IFileSystem['readFile']>().mockResolvedValue(''),
      writeFile: jest.fn<IFileSystem['writeFile']>().mockResolvedValue(undefined),
      deleteFile: jest.fn<IFileSystem['deleteFile']>().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IFileSystem>;

    mockProject = {
      rootDirectory: '/root',
      paths: {
        inbox: '/root/inbox',
        outbox: '/root/outbox',
      },
      fileSystem: mockFileSystem,
    } as unknown as jest.Mocked<IProject>;

    bus = new FileSystemBus(mockProject, mockFileSystem);
  });

  describe('constructor', () => {
    it('should use default paths if not provided in config', () => {
      const minimalProject = {
        rootDirectory: '/custom-root',
        paths: {},
        fileSystem: mockFileSystem,
      };

      const minimalBus = new FileSystemBus(minimalProject as unknown as IProject, mockFileSystem);

      minimalBus.watchInbox(jest.fn<() => Promise<void>>().mockResolvedValue(undefined));
      expect(mockWatch).toHaveBeenCalledWith('/custom-root/.ai/comms/inbox', expect.any(Object));
    });
  });

  const flushPromises = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

  describe('watchInbox', () => {
    it('should start watching inbox path', () => {
      bus.watchInbox(jest.fn<() => Promise<void>>().mockResolvedValue(undefined));
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

      const addHandlerCall = mockOn.mock.calls.find((call) => call[0] === 'add');
      const addHandler = addHandlerCall?.[1] as (p: string) => void;

      const message: IBusMessage = { id: 'msg1', source: 'test', payload: {} };
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue(JSON.stringify(message));

      addHandler('/root/inbox/file.json');
      await flushPromises();

      expect(mockFileSystem.readFile).toHaveBeenCalledWith('/root/inbox/file.json');
      expect(handler).toHaveBeenCalledWith(message);
      expect(mockFileSystem.deleteFile).toHaveBeenCalledWith('/root/inbox/file.json');
    });

    it('should skip if file does not exist when handler is called', async () => {
      bus.watchInbox(jest.fn<() => Promise<void>>().mockResolvedValue(undefined));

      const addHandlerCall = mockOn.mock.calls.find((call) => call[0] === 'add');
      const addHandler = addHandlerCall?.[1] as (p: string) => void;
      mockFileSystem.exists.mockResolvedValue(false);

      addHandler('/root/inbox/missing.json');
      await flushPromises();

      expect(mockFileSystem.readFile).not.toHaveBeenCalled();
    });

    it('should handle handler errors gracefully', async () => {
      const handler = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('handler fail'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      bus.watchInbox(handler);

      const addHandlerCall = mockOn.mock.calls.find((call) => call[0] === 'add');
      const addHandler = addHandlerCall?.[1] as (p: string) => void;
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue('{}');

      addHandler('/root/inbox/error.json');
      await flushPromises();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('stop', () => {
    it('should stop watcher if running', async () => {
      bus.watchInbox(jest.fn<() => Promise<void>>().mockResolvedValue(undefined));
      await bus.stop();
      expect(mockClose).toHaveBeenCalled();
    });

    it('should do nothing if not running', async () => {
      await bus.stop();
      expect(mockClose).not.toHaveBeenCalled();
    });
  });

  describe('sendRequest', () => {
    it('should write request file to inbox', async () => {
      const message: IBusMessage = { id: 'req1', source: 'planner', payload: { task: 'go' } };
      await bus.sendRequest(message);

      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\/root\/inbox\/req_planner_req1_.*\.json/),
        expect.stringContaining('"id": "req1"'),
      );
    });

    it('should use correlationId in filename if available', async () => {
      const message: IBusMessage = { id: 'req1', correlationId: 'corr1', source: 'planner', payload: {} };
      await bus.sendRequest(message);
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/req_planner_corr1_.*\.json/),
        expect.any(String),
      );
    });
  });

  describe('sendResponse', () => {
    it('should write response file to outbox', async () => {
      await bus.sendResponse('corr1', { result: 'ok' });
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('/root/outbox/res_architect_corr1.json'),
        expect.stringContaining('"correlationId": "corr1"'),
      );
    });
  });

  describe('waitForResponse', () => {
    // Note: We avoid global fake timers here to ensure async events are processed correctly.
    // We only use fake timers for specific timeout tests.

    it('should resolve if response already exists', async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue(JSON.stringify({ id: 'res1', payload: { x: 1 } }));

      const result = await bus.waitForResponse('corr1', 5000);
      expect(result.id).toBe('res1');
      expect(mockFileSystem.deleteFile).toHaveBeenCalled();
    });

    it('should wait for file-added event', async () => {
      mockFileSystem.exists.mockResolvedValue(false);
      const promise = bus.waitForResponse('corr1', 5000);

      const addListenerCall = mockOn.mock.calls.find((call) => call[0] === 'add');
      const addListener = addListenerCall?.[1] as (p: string) => void;

      if (!addListener) {
        throw new Error('Could not find add listener on watcher');
      }

      mockFileSystem.readFile.mockResolvedValue(
        JSON.stringify({
          id: 'test-uuid',
          correlationId: 'corr1',
          source: 'architect',
          type: 'response',
          payload: { status: 'COMPLETE' },
        }),
      );

      addListener('/root/outbox/res_architect_corr1.json');

      const result = await promise;
      expect(result.id).toBe('test-uuid');
    });

    it('should throw on timeout', async () => {
      jest.useFakeTimers();
      mockFileSystem.exists.mockResolvedValue(false);
      const promise = bus.waitForResponse('corr1', 100);

      const rejectionPromise = expect(promise).rejects.toThrow(/Timeout waiting for response/);

      await jest.advanceTimersByTimeAsync(200);

      await rejectionPromise;
      jest.useRealTimers();
    });

    it('should handle read/delete errors in event listener', async () => {
      mockFileSystem.exists.mockResolvedValue(false);
      const promise = bus.waitForResponse('corr2', 1000);

      mockFileSystem.readFile.mockImplementation(() => {
        throw new Error('read fail');
      });

      const responseEmitter = (bus as unknown as { responseEmitter: { emit: (e: string, p: string) => void } })
        .responseEmitter;
      responseEmitter.emit('file-added', '/root/outbox/res_architect_corr2.json');

      await expect(promise).rejects.toThrow('read fail');
    });

    it('should handle race condition where file appears after listener is set', async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue(JSON.stringify({ id: 'res-race', payload: {} }));

      const promise = bus.waitForResponse('corr-race', 5000);

      const result = await promise;
      expect(result.id).toBe('res-race');
      expect(mockFileSystem.readFile).toHaveBeenCalled();
    });

    it('should handle invalid JSON in readAndCleanupResponse', async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue('invalid-json');

      await expect(bus.waitForResponse('corr-fail')).rejects.toThrow();
    });

    it('should handle error in onFileAdded try/catch block', async () => {
      mockFileSystem.exists.mockResolvedValue(false);
      const promise = bus.waitForResponse('corr-err', 1000);

      const responseEmitter = (bus as unknown as { responseEmitter: { emit: (e: string, p: string) => void } })
        .responseEmitter;

      mockFileSystem.readFile.mockResolvedValue('invalid-json');

      responseEmitter.emit('file-added', '/root/outbox/res_architect_corr-err.json');

      await expect(promise).rejects.toThrow();
    });
  });

  describe('outbox watcher and emitters', () => {
    it('should log error when outbox watcher fails to initialize', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockWatch.mockImplementationOnce(() => {
        throw new Error('watch fail');
      });

      const b = new FileSystemBus(mockProject, mockFileSystem);
      (b as unknown as { ensureOutboxWatcher: () => void }).ensureOutboxWatcher();

      expect(consoleSpy).toHaveBeenCalledWith('Failed to initialize outbox watcher:', expect.any(Error));
      consoleSpy.mockRestore();
    });

    it('should log error when outbox watcher emits error', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const b = new FileSystemBus(mockProject, mockFileSystem);
      (b as unknown as { ensureOutboxWatcher: () => void }).ensureOutboxWatcher();

      const errorCalls = mockOn.mock.calls.filter((call) => call[0] === 'error');
      const errorListener = errorCalls[errorCalls.length - 1]?.[1] as (e: Error) => void;

      if (errorListener) {
        errorListener(new Error('emitted outbox error'));
        expect(consoleSpy).toHaveBeenCalledWith('Outbox watcher error:', expect.any(Error));
      }
      consoleSpy.mockRestore();
    });

    it('should handle errors in outbox watcher add event', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await bus.sendResponse('c1', {});

      const addCalls = mockOn.mock.calls.filter((call) => call[0] === 'add');
      const addListener = addCalls[addCalls.length - 1]?.[1] as (p: string) => void;

      if (addListener) {
        const responseEmitter = (bus as unknown as { responseEmitter: { emit: (e: string, p: string) => void } })
          .responseEmitter;
        jest.spyOn(responseEmitter, 'emit').mockImplementationOnce(() => {
          throw new Error('emit fail');
        });

        addListener('/some/path.json');
        expect(consoleSpy).toHaveBeenCalledWith('Error in outbox watcher add event:', expect.any(Error));
      }
      consoleSpy.mockRestore();
    });
  });

  describe('waitForResponse double check', () => {
    it('should handle error in double-check block of waitForResponse', async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockImplementation(() => {
        throw new Error('double check read fail');
      });

      const promise = bus.waitForResponse('corr-double');
      await expect(promise).rejects.toThrow('double check read fail');
    });
  });

  describe('inbox watcher errors', () => {
    it('should log error if inbox watcher fails to initialize', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockWatch.mockImplementationOnce(() => {
        throw new Error('inbox init fail');
      });

      bus.watchInbox(async () => {});
      expect(consoleSpy).toHaveBeenCalledWith('Failed to initialize inbox watcher:', expect.any(Error));
      consoleSpy.mockRestore();
    });

    it('should log error if inbox watcher emits error', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      bus.watchInbox(async () => {});

      const errorListenerCall = mockOn.mock.calls.filter((call) => call[0] === 'error')[0];
      const errorListener = errorListenerCall?.[1] as (e: Error) => void;

      if (errorListener) {
        errorListener(new Error('inbox error'));
        expect(consoleSpy).toHaveBeenCalledWith('Inbox watcher error:', expect.any(Error));
      }
      consoleSpy.mockRestore();
    });

    it('should handle invalid JSON in inbox message', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      bus.watchInbox(async () => {});

      const addListenerCall = mockOn.mock.calls.find((call) => call[0] === 'add');
      const addListener = addListenerCall?.[1] as (p: string) => void;

      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue('invalid-json');

      addListener('/root/inbox/bad.json');
      await flushPromises();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error processing inbox message'),
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('edge cases', () => {
    it('should stop and close both watchers', async () => {
      bus.watchInbox(async () => {});
      (bus as unknown as { ensureOutboxWatcher: () => void }).ensureOutboxWatcher();
      await bus.stop();
      expect(mockClose).toHaveBeenCalledTimes(2);
    });

    it('should handle stop when no watcher exists', async () => {
      await expect(bus.stop()).resolves.toBeUndefined();
      expect(mockClose).not.toHaveBeenCalled();
    });

    it('should use default paths when config is empty', async () => {
      const minimalProject = {
        rootDirectory: '/tmp',
        paths: {},
        fileSystem: mockFileSystem,
      };
      const b = new FileSystemBus(minimalProject as unknown as IProject, mockFileSystem);
      await b.sendResponse('c1', {});
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('/tmp/.ai/comms/outbox'),
        expect.any(String),
      );
    });
  });
});
