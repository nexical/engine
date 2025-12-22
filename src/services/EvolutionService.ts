import yaml from 'js-yaml';
import { Project } from '../domain/Project.js';
import { FileSystemService } from './FileSystemService.js';
import { Signal } from '../workflow/Signal.js';

export interface EvolutionEntry {
    timestamp: string;
    state: string;
    signal_type: string;
    reason: string;
    feedback?: string;
    tasks_at_failure?: string[];
}

export interface IEvolutionService {
    recordFailure(stateName: string, signal: Signal, completedTasks?: string[]): Promise<void>;
    getLogSummary(): string;
}

export class EvolutionService implements IEvolutionService {
    private disk: FileSystemService;

    constructor(private project: Project) {
        this.disk = new FileSystemService();
    }

    public async recordFailure(stateName: string, signal: Signal, completedTasks: string[] = []): Promise<void> {
        const logPath = this.project.paths.log;
        let logs: EvolutionEntry[] = [];

        if (this.disk.exists(logPath)) {
            try {
                const content = this.disk.readFile(logPath);
                logs = yaml.load(content) as EvolutionEntry[] || [];
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
            const logs = yaml.load(content) as EvolutionEntry[];
            if (!Array.isArray(logs) || logs.length === 0) {
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
