import yaml from 'js-yaml';
import { Project } from '../domain/Project.js';
import { FileSystemService } from './FileSystemService.js';
import { Signal } from '../workflow/Signal.js';
import { z } from 'zod';

export const EvolutionEntrySchema = z.object({
    timestamp: z.string(),
    state: z.string(),
    signal_type: z.string(),
    reason: z.string(),
    feedback: z.string().optional(),
    tasks_at_failure: z.array(z.string()).optional()
});

export type EvolutionEntry = z.infer<typeof EvolutionEntrySchema>;

export interface IEvolutionService {
    recordFailure(stateName: string, signal: Signal, completedTasks?: string[]): Promise<void>;
    getLogSummary(): string;
}

export class EvolutionService implements IEvolutionService {
    constructor(private project: Project, private disk: FileSystemService) {
    }

    public async recordFailure(stateName: string, signal: Signal, completedTasks: string[] = []): Promise<void> {
        const logPath = this.project.paths.log;
        let logs: EvolutionEntry[] = [];

        if (this.disk.exists(logPath)) {
            try {
                const content = this.disk.readFile(logPath);
                const raw = yaml.load(content);
                const result = z.array(EvolutionEntrySchema).safeParse(raw);
                if (result.success) {
                    logs = result.data;
                } else {
                    console.error("Evolution log corrupted or invalid:", result.error);
                    // Decide whether to overwrite or backup. For now, we start fresh but log error.
                }
            } catch (e) {
                console.error("Failed to load evolution log:", e);
            }
        }

        const newEntry: EvolutionEntry = {
            timestamp: new Date().toISOString(),
            state: stateName,
            signal_type: signal.type,
            reason: signal.reason,
            feedback: signal.metadata?.feedback,
            tasks_at_failure: completedTasks
        };

        logs.push(newEntry);
        this.disk.writeFileAtomic(logPath, yaml.dump(logs));
    }

    public getLogSummary(): string {
        const logPath = this.project.paths.log;
        if (!this.disk.exists(logPath)) {
            return "No historical failures recorded.";
        }

        try {
            const content = this.disk.readFile(logPath);
            const raw = yaml.load(content);
            const result = z.array(EvolutionEntrySchema).safeParse(raw);

            if (!result.success) {
                return "Error reading evolution log (Invalid Schema).";
            }

            const logs = result.data;
            if (logs.length === 0) {
                return "No historical failures recorded.";
            }

            return logs.map((log, index) => {
                let entry = `[Attempt ${index + 1}] At ${log.timestamp} during ${log.state}: ${log.signal_type} - ${log.reason}`;
                if (log.feedback) entry += `\nUser Feedback: ${log.feedback}`;
                return entry;
            }).join('\n\n');
        } catch (e) {
            return "Error reading evolution log.";
        }
    }
}
