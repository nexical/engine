import yaml from 'js-yaml';
import nodePath from 'path';

import { FileSystemService } from '../services/FileSystemService.js';
import { Signal, SignalType } from '../workflow/Signal.js';
import { Architecture } from './Architecture.js';
import { Plan } from './Plan.js';
import { IProject } from './Project.js';
import { IRuntimeHost } from './RuntimeHost.js';
import { EngineState } from './State.js';

export interface IWorkspace {
  getArchitecture(name: string): Promise<Architecture>;
  saveArchitecture(doc: Architecture): Promise<void>;
  loadPlan(): Promise<Plan>;
  savePlan(doc: Plan): Promise<void>;
  archiveArtifacts(): Promise<void>;
  detectSignal(path?: string): Promise<Signal | null>;
  clearSignals(): Promise<void>;
  saveState(state: EngineState): Promise<void>;
  loadState(): Promise<EngineState | undefined>;
  flush(): Promise<void>;
}

export class Workspace implements IWorkspace {
  private disk: FileSystemService;
  private cache: Map<string, unknown> = new Map();
  private pendingWrites: Set<Promise<void>> = new Set();

  constructor(
    private project: IProject,
    private host?: IRuntimeHost,
  ) {
    this.disk = project.fileSystem as FileSystemService;
  }

  private async scheduleWrite(filePath: string, content: string): Promise<void> {
    const promise = (async (): Promise<void> => {
      const release = await this.disk.acquireLock(filePath);
      try {
        await this.disk.writeFileAtomic(filePath, content);
      } finally {
        await release();
      }
    })();

    this.pendingWrites.add(promise);
    try {
      await promise;
    } catch (e) {
      if (this.host) {
        this.host.log('error', `Async write failed for ${filePath}: ${(e as Error).message}`);
      }
    } finally {
      this.pendingWrites.delete(promise);
    }
  }

  public async flush(): Promise<void> {
    await Promise.all(Array.from(this.pendingWrites));
  }

  public async getArchitecture(_name: string): Promise<Architecture> {
    const architectureCache = this.cache.get('architecture') as Architecture;
    if (architectureCache) {
      return await Promise.resolve(architectureCache);
    }

    const pathString = this.project.paths.architectureCurrent;
    if (await this.disk.exists(pathString)) {
      const content = await this.disk.readFile(pathString);
      const doc = Architecture.fromMarkdown(content);
      this.cache.set('architecture', doc);
      return doc;
    }
    return Architecture.fromMarkdown('');
  }

  public async saveArchitecture(doc: Architecture): Promise<void> {
    this.cache.set('architecture', doc);
    await this.scheduleWrite(this.project.paths.architectureCurrent, doc.content);
  }

  public async loadPlan(): Promise<Plan> {
    const planCache = this.cache.get('plan') as Plan;
    if (planCache) {
      return await Promise.resolve(planCache);
    }

    const pathString = this.project.paths.planCurrent;
    if (await this.disk.exists(pathString)) {
      const content = await this.disk.readFile(pathString);
      const plan = Plan.fromYaml(content);
      this.cache.set('plan', plan);
      return plan;
    }
    return new Plan('New Plan', []);
  }

  public async savePlan(doc: Plan): Promise<void> {
    this.cache.set('plan', doc);
    await this.scheduleWrite(this.project.paths.planCurrent, doc.toYaml());
  }

  public async archiveArtifacts(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveDir = this.project.paths.archive;

    // Archive architecture
    const archCurrent = this.project.paths.architectureCurrent;
    if (await this.disk.exists(archCurrent)) {
      const archArchive = nodePath.join(archiveDir, `${timestamp}.architecture.md`);
      await this.disk.copy(archCurrent, archArchive);
      await this.disk.deleteFile(archCurrent);
    }

    // Archive plan
    const planCurrent = this.project.paths.planCurrent;
    if (await this.disk.exists(planCurrent)) {
      const planArchive = nodePath.join(archiveDir, `${timestamp}.plan.yml`);
      await this.disk.copy(planCurrent, planArchive);
      await this.disk.deleteFile(planCurrent);
    }
  }

  /**
   * Detects if any signal files exist in the signals directory.
   * Returns the first valid signal found, or null.
   * @param path Optional path to check for signals. Defaults to project signals directory.
   */
  public async detectSignal(path?: string): Promise<Signal | null> {
    const signalsDir = path || this.project.paths.signals;
    if (!(await this.disk.isDirectory(signalsDir))) return null;

    const files = await this.disk.listFiles(signalsDir);
    for (const file of files) {
      if (file.endsWith('.signal.yml') || file.endsWith('.signal.yaml')) {
        const content = await this.disk.readFile(`${signalsDir}/${file}`);
        try {
          const data = yaml.load(content) as { type: string; reason: string; metadata?: Record<string, unknown> };
          // Validate minimal signal structure
          if (!data || !data.type || !data.reason) {
            if (this.host) {
              this.host.log('warn', `Invalid signal file content in ${file}`);
            }
            continue;
          }
          return new Signal(data.type as SignalType, data.reason, data.metadata);
        } catch (e) {
          if (this.host) {
            this.host.log('error', `Failed to parse signal file ${file}: ${(e as Error).message}`);
          }
        }
      }
    }
    return await Promise.resolve(null);
  }

  /**
   * Clears all signal files from the signals directory.
   */
  public async clearSignals(): Promise<void> {
    const signalsDir = this.project.paths.signals;
    if (await this.disk.isDirectory(signalsDir)) {
      const files = await this.disk.listFiles(signalsDir);
      for (const file of files) {
        await this.disk.deleteFile(`${signalsDir}/${file}`);
      }
    }
  }

  public async saveState(state: EngineState): Promise<void> {
    await this.scheduleWrite(this.project.paths.state, state.toYaml());
  }

  public async loadState(): Promise<EngineState | undefined> {
    if (await this.disk.exists(this.project.paths.state)) {
      const content = await this.disk.readFile(this.project.paths.state);
      return EngineState.fromYaml(content);
    }
    return undefined;
  }
}
