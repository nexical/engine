import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { z } from 'zod';

import { IFileSystem } from '../domain/IFileSystem.js';
import { IProject } from '../domain/Project.js';
import { Signal } from '../workflow/Signal.js';

export const EvolutionEntrySchema = z.object({
  timestamp: z.string(),
  state: z.string(),
  signal_type: z.string(),
  reason: z.string(),
  feedback: z.string().optional(),
  tasks_at_failure: z.array(z.string()).optional(),
  context_tags: z.array(z.string()).optional(),
});

export type EvolutionEntry = z.infer<typeof EvolutionEntrySchema>;

export interface IEvolutionService {
  recordEvent(stateName: string, signal: Signal, completedTasks?: string[], contextTags?: string[]): Promise<void>;
  retrieve(context: string): Promise<string>;
}

export class EvolutionService implements IEvolutionService {
  constructor(
    private project: IProject,
    private disk: IFileSystem,
  ) {}

  public async recordEvent(
    stateName: string,
    signal: Signal,
    completedTasks: string[] = [],
    contextTags: string[] = [],
  ): Promise<void> {
    const logPath = this.project.paths.log;

    const newEntry: EvolutionEntry = {
      timestamp: new Date().toISOString(),
      state: stateName,
      signal_type: signal.type,
      reason: signal.reason,
      feedback: signal.metadata?.feedback as string | undefined,
      tasks_at_failure: completedTasks,
      context_tags: contextTags,
    };

    // Append as JSON Line
    const line = JSON.stringify(newEntry) + '\n';

    // We use fs.appendFile via project.fileSystem if supported, or raw fs if IFileSystem assumes overwrites.
    // IFileSystem usually has writeFile, not appendFile.
    // So we use native fs for append optimization, assuming local environment (engine is local).
    // The previous implementation loaded the whole file.

    // Check if IFileSystem has append support? No.
    // We'll use fs directly for efficiency if path is local.
    await fs.promises.appendFile(logPath, line, 'utf8');
  }

  public async retrieve(context: string): Promise<string> {
    const sections: string[] = [];

    // 1. Short-Term Memory (Current Log)
    const logSummary = await this.getShortTermMemory();
    if (logSummary) {
      sections.push(`## Recent Events (Short-Term Memory)\n${logSummary}`);
    }

    // 2. Long-Term Wisdom (Topic-Based)
    const wisdom = await this.getLongTermWisdom(context);
    if (wisdom) {
      sections.push(`## Established Wisdom (Long-Term Memory)\n${wisdom}`);
    }

    if (sections.length === 0) {
      return 'No historical failures or wisdom recorded.';
    }

    return sections.join('\n\n');
  }

  private async getShortTermMemory(): Promise<string | null> {
    const logPath = this.project.paths.log;
    if (!fs.existsSync(logPath)) return null;

    const entries: EvolutionEntry[] = [];
    const maxEntries = 20; // Keep last 20 events in context

    try {
      const fileStream = fs.createReadStream(logPath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      // Rolling buffer
      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line) as EvolutionEntry;
          entries.push(entry);
          if (entries.length > maxEntries) {
            entries.shift();
          }
        } catch {
          // ignore parse errors
        }
      }

      if (entries.length === 0) return null;

      return entries
        .map((log, index) => {
          let entry = `[Event ${index + 1}] At ${log.timestamp} during ${log.state}: ${log.signal_type} - ${log.reason}`;
          if (log.feedback) entry += `\nUser Feedback: ${log.feedback}`;
          return entry;
        })
        .join('\n\n');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to read evolution log:', e);
      return null;
    }
  }

  private async getLongTermWisdom(context: string): Promise<string | null> {
    const indexPath = this.project.paths.evolutionIndex;
    if (!(await this.disk.exists(indexPath))) return null;

    try {
      // Load Index
      const indexContent = await this.disk.readFile(indexPath);
      const index = JSON.parse(indexContent) as Record<string, string>;

      // Extract unique topics based on keyword matching
      const foundTopics = new Set<string>();
      const contextLower = context.toLowerCase();

      for (const [keyword, topic] of Object.entries(index)) {
        if (contextLower.includes(keyword.toLowerCase())) {
          foundTopics.add(topic);
        }
      }

      // Always include 'general' topic if it exists
      foundTopics.add('general');

      // Read Topic Files
      const wisdoms: string[] = [];
      for (const topic of foundTopics) {
        const topicPath = path.join(this.project.paths.evolutionTopics, `${topic}.md`);
        if (await this.disk.exists(topicPath)) {
          const content = await this.disk.readFile(topicPath);
          wisdoms.push(`### Topic: ${topic}\n${content}`);
        }
      }

      return wisdoms.join('\n\n');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to retrieve long-term wisdom:', error);
      return null;
    }
  }
}
