import chokidar from 'chokidar';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { IProject } from '../domain/Project.js';
import { IFileSystem } from '../domain/IFileSystem.js';

export interface IBusMessage {
  id: string;
  correlationId?: string;
  source: string;
  type?: string;
  payload: any;
  timestamp?: number;
}

export class FileSystemBus {
  private inboxPath: string;
  private outboxPath: string;
  private watcher: chokidar.FSWatcher | null = null;
  private messageQueue: Promise<void> = Promise.resolve();

  constructor(
    private project: IProject,
    private fileSystem: IFileSystem,
  ) {
    this.inboxPath = this.project.paths.inbox || path.join(this.project.rootDirectory, '.ai/comms/inbox');
    this.outboxPath = this.project.paths.outbox || path.join(this.project.rootDirectory, '.ai/comms/outbox');
  }

  /**
   * Starts watching the Inbox for new messages (Architect Mode).
   * @param handler Function to process incoming messages.
   */
  public watchInbox(handler: (message: IBusMessage) => Promise<void>): void {
    if (this.watcher) {
      return;
    }

    this.watcher = chokidar.watch(this.inboxPath, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: false,
      depth: 0,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher.on('add', (filePath) => {
      // Chain processing to ensure sequential execution (FIFO)
      this.messageQueue = this.messageQueue.then(async () => {
        try {
          // Check if file still exists (it might be processed by another event if duplications occure, safe guard)
          if (!this.project.fileSystem.exists(filePath)) return;

          const content = this.project.fileSystem.readFile(filePath);
          const message = JSON.parse(content) as IBusMessage;

          await handler(message);

          // Processed, delete the request file
          this.project.fileSystem.deleteFile(filePath);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(`Error processing inbox message ${filePath}:`, error);
        }
      });
    });
  }

  public stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  private generateCorrelationId(): string {
    return uuidv4();
  }

  /**
   * Sends a request to the Inbox (Planner/Task -> Architect).
   */
  public async sendRequest(message: IBusMessage): Promise<void> {
    const fileName = `req_${message.source}_${message.correlationId || message.id}.json`;
    const filePath = path.join(this.inboxPath, fileName);

    message.timestamp = Date.now();
    this.project.fileSystem.writeFile(filePath, JSON.stringify(message, null, 2));
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

    const fileName = `res_architect_${correlationId}.json`;
    const filePath = path.join(this.outboxPath, fileName);

    this.project.fileSystem.writeFile(filePath, JSON.stringify(message, null, 2));
  }

  /**
   * Polls the Outbox for a specific response (Planner/Task waiting).
   */
  public async waitForResponse(correlationId: string, timeoutMs: number = 60000): Promise<IBusMessage> {
    const start = Date.now();
    const pollInterval = 500;
    const fileName = `res_architect_${correlationId}.json`;
    const filePath = path.join(this.outboxPath, fileName);

    while (Date.now() - start < timeoutMs) {
      if (this.project.fileSystem.exists(filePath)) {
        try {
          const content = this.project.fileSystem.readFile(filePath);
          const message = JSON.parse(content) as IBusMessage;

          // Cleanup response
          this.project.fileSystem.deleteFile(filePath);

          return message;
        } catch (e) {
          // ignore parse error, retry
        }
      }
      // Sleep
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Timeout waiting for response to correlationId: ${correlationId}`);
  }
}
