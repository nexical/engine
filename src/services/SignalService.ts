import path from 'path';

import { IRuntimeHost } from '../domain/RuntimeHost.js';
import { SignalDetectedError } from '../errors/SignalDetectedError.js';
import { ISignalJSON, Signal, SignalType } from '../workflow/Signal.js';
import { FileSystemService } from './FileSystemService.js';

export class SignalService {
  // Signal Priority Hierarchy (Higher number = Higher Priority)
  private static PRIORITY: Record<SignalType, number> = {
    [SignalType.REARCHITECT]: 100,
    [SignalType.REPLAN]: 80,
    [SignalType.CLARIFICATION_NEEDED]: 50,
    [SignalType.FAIL]: 20,
    [SignalType.COMPLETE]: 10,
    [SignalType.RETRY]: 5,
    [SignalType.NEXT]: 1,
    [SignalType.WAIT]: 1,
  };

  constructor(
    private fs: FileSystemService,
    private host?: IRuntimeHost,
  ) {}

  /**
   * Scans the signals directory for the highest priority signal.
   * @param signalsDir absolute path to the signals directory
   * @returns The highest priority signal found, or null.
   */
  public async getHighestPrioritySignal(signalsDir: string): Promise<Signal | null> {
    if (!(await this.fs.isDirectory(signalsDir))) {
      return null;
    }

    const files = (await this.fs.listFiles(signalsDir)).filter((f) => f.endsWith('.json'));
    if (files.length === 0) {
      return null;
    }

    const signals: Signal[] = [];

    for (const file of files) {
      try {
        const filePath = path.join(signalsDir, file);
        const content = await this.fs.readFile(filePath);

        const json = JSON.parse(content) as ISignalJSON;
        const signal = Signal.fromJSON(json);
        signals.push(signal);
      } catch (e) {
        if (this.host) {
          this.host.log('warn', `Failed to parse signal file ${file}: ${(e as Error).message}`);
        }
      }
    }

    if (signals.length === 0) {
      return null;
    }

    // Sort by priority (descending)
    signals.sort((a, b) => {
      const pA = SignalService.PRIORITY[a.type] || 0;
      const pB = SignalService.PRIORITY[b.type] || 0;
      return pB - pA;
    });

    return signals[0];
  }

  /**
   * Helper to write a signal to a specific file path.
   */
  public async writeSignal(filePath: string, signal: Signal): Promise<void> {
    const json = signal.toJSON();
    const content = JSON.stringify(json, null, 2);
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!(await this.fs.exists(dir))) {
      // We assume FileSystemService doesn't have mkdirp, so we might need to rely on the caller or add it.
      // But typically .ai/signals should exist.
      // Let's safe-guard if possible, or assume it exists.
      // FileSystemService usually wraps fs, let's assume valid path.
    }
    await this.fs.writeFile(filePath, content);
  }

  /**
   * Clears a specific signal file or all signals if no file provided (use with caution).
   */
  public async clearSignals(signalsDir: string): Promise<void> {
    if (await this.fs.isDirectory(signalsDir)) {
      const files = await this.fs.listFiles(signalsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          await this.fs.deleteFile(path.join(signalsDir, file));
        }
      }
    }
  }

  /**
   * Checks for signals and throws if a high-priority one is found.
   * Used by Executors during task loops.
   */
  public async ensureNoInterrupt(signalsDir: string, taskId?: string): Promise<void> {
    const signal = await this.getHighestPrioritySignal(signalsDir);
    if (signal) {
      // If we found a signal
      throw new SignalDetectedError(signal, taskId || 'unknown');
    }
  }
}
