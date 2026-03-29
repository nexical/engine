import chokidar from 'chokidar';
import { EventEmitter } from 'events';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { IFileSystem } from '../domain/IFileSystem.js';
import { IProject } from '../domain/Project.js';

export interface IBusMessage {
  id: string;
  correlationId?: string;
  source: string;
  type?: string;
  payload: unknown;
  timestamp?: number;
}

export class FileSystemBus {
  private inboxPath: string;
  private outboxPath: string;
  private inboxWatcher: chokidar.FSWatcher | null = null;
  private outboxWatcher: chokidar.FSWatcher | null = null;
  private messageQueue: Promise<void> = Promise.resolve();
  private responseEmitter: EventEmitter = new EventEmitter();

  constructor(
    private project: IProject,
    private fileSystem: IFileSystem,
  ) {
    this.inboxPath = this.project.paths.inbox || path.join(this.project.rootDirectory, '.ai/comms/inbox');
    this.outboxPath = this.project.paths.outbox || path.join(this.project.rootDirectory, '.ai/comms/outbox');

    // Increase listener limit for high-concurrency scenarios
    this.responseEmitter.setMaxListeners(50);
  }

  /**
   * Starts watching the Inbox for new messages (Architect Mode).
   * @param handler Function to process incoming messages.
   */
  public watchInbox(handler: (message: IBusMessage) => Promise<void>): void {
    if (this.inboxWatcher) {
      return;
    }

    try {
      this.inboxWatcher = chokidar.watch(this.inboxPath, {
        ignored: /(^|[/\\])\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: false,
        depth: 0,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50,
        },
      });

      this.inboxWatcher.on('add', (filePath) => {
        // Chain processing to ensure sequential execution (FIFO)
        this.messageQueue = this.messageQueue.then(async () => {
          try {
            // Check if file still exists (it might be processed by another event if duplications occure, safe guard)
            if (!(await this.project.fileSystem.exists(filePath))) return;

            const content = await this.project.fileSystem.readFile(filePath);
            const message = JSON.parse(content) as IBusMessage;

            await handler(message);

            // Processed, delete the request file
            await this.project.fileSystem.deleteFile(filePath);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error(`Error processing inbox message ${filePath}:`, error);
          }
        });
      });

      this.inboxWatcher.on('error', (error) => {
        // eslint-disable-next-line no-console
        console.error('Inbox watcher error:', error);
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to initialize inbox watcher:', error);
    }
  }

  public async stop(): Promise<void> {
    if (this.inboxWatcher) {
      await this.inboxWatcher.close();
      this.inboxWatcher = null;
    }
    if (this.outboxWatcher) {
      await this.outboxWatcher.close();
      this.outboxWatcher = null;
    }
    this.responseEmitter.removeAllListeners();
  }

  /**
   * Sends a request to the Inbox (Planner/Task -> Architect).
   * Uses unique filename to prevent collisions.
   */
  public async sendRequest(message: IBusMessage): Promise<void> {
    // Unique filename: req_SOURCE_CORRELATIONID_TIMESTAMP_RANDOM.json
    const safeSource = message.source.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeId = (message.correlationId || message.id).replace(/[^a-zA-Z0-9_-]/g, '');
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);

    const fileName = `req_${safeSource}_${safeId}_${timestamp}_${random}.json`;
    const filePath = path.join(this.inboxPath, fileName);

    message.timestamp = timestamp;
    await this.project.fileSystem.writeFile(filePath, JSON.stringify(message, null, 2));
  }

  /**
   * Writes a response to the Outbox (Architect -> Planner/Task).
   */
  public async sendResponse(correlationId: string, payload: Record<string, unknown>): Promise<void> {
    const id = uuidv4();
    const message: IBusMessage = {
      id,
      correlationId,
      source: 'architect',
      payload,
      timestamp: Date.now(),
    };

    // Response filename relies on correlationId for the waiter to find it.
    // We assume correlationId is unique per transaction.
    const fileName = `res_architect_${correlationId}.json`;
    const filePath = path.join(this.outboxPath, fileName);

    await this.project.fileSystem.writeFile(filePath, JSON.stringify(message, null, 2));
  }

  private ensureOutboxWatcher(): void {
    if (this.outboxWatcher) return;

    try {
      this.outboxWatcher = chokidar.watch(this.outboxPath, {
        ignored: /(^|[/\\])\../,
        persistent: true,
        ignoreInitial: false,
        depth: 0,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50,
        },
      });

      this.outboxWatcher.on('add', (filePath) => {
        try {
          // Emit event with filename or content
          // We emit the filename so listeners can check if it matches their correlationId
          this.responseEmitter.emit('file-added', filePath);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Error in outbox watcher add event:', error);
        }
      });

      this.outboxWatcher.on('error', (error) => {
        // eslint-disable-next-line no-console
        console.error('Outbox watcher error:', error);
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to initialize outbox watcher:', error);
    }
  }

  /**
   * Waits for a response in the Outbox using event listeners (push) instead of polling.
   */
  public async waitForResponse(correlationId: string, timeoutMs: number = 60000): Promise<IBusMessage> {
    this.ensureOutboxWatcher();

    const expectedFileName = `res_architect_${correlationId}.json`;
    const expectedFilePath = path.join(this.outboxPath, expectedFileName);

    // 2. Wait for event
    return new Promise((resolve, reject) => {
      const timeoutTimer: NodeJS.Timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout waiting for response to correlationId: ${correlationId}`));
      }, timeoutMs);

      const onFileAdded = (filePath: string): void => {
        if (path.basename(filePath) === expectedFileName) {
          cleanup();
          this.readAndCleanupResponse(filePath).then(resolve).catch(reject);
        }
      };

      const cleanup = (): void => {
        this.responseEmitter.off('file-added', onFileAdded);
        if (timeoutTimer) clearTimeout(timeoutTimer);
      };

      // Listen
      this.responseEmitter.on('file-added', onFileAdded);

      // Check if file already exists (race condition: arrival before we wait)
      this.project.fileSystem
        .exists(expectedFilePath)
        .then((exists) => {
          if (exists) {
            cleanup();
            this.readAndCleanupResponse(expectedFilePath).then(resolve).catch(reject);
          }
        })
        .catch(reject);
    });
  }

  private async readAndCleanupResponse(filePath: string): Promise<IBusMessage> {
    const content = await this.project.fileSystem.readFile(filePath);
    const message = JSON.parse(content) as IBusMessage;
    // Cleanup response
    await this.project.fileSystem.deleteFile(filePath);
    return message;
  }
}
