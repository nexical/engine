import debug from 'debug';
import { Plan } from '../models/Plan.js';
import { Task } from '../models/Task.js';
import type { Orchestrator } from '../orchestrator.js';
import { AgentRunner } from '../services/AgentRunner.js';
import fs from 'fs-extra';
import path from 'path';
import { Signal } from '../models/State.js';
import { SignalDetectedError } from '../errors/SignalDetectedError.js';
const log = debug('executor');

export class Executor {
    private agentRunner: AgentRunner;
    private taskPromises: Map<string, Promise<void>> = new Map();

    constructor(
        private core: Orchestrator
    ) {
        this.agentRunner = new AgentRunner(this.core);
    }

    private checkForSignals(): void {
        const signalsPath = path.join(this.core.config.nexicalPath, 'signals');
        if (fs.existsSync(signalsPath)) {
            const files = fs.readdirSync(signalsPath);
            if (files.length > 0) {
                // Read the first signal found
                const signalFile = files[0];
                const content = fs.readFileSync(path.join(signalsPath, signalFile), 'utf8');

                // Parse the signal (assuming it's a markdown file with frontmatter or structured text)
                // For now, let's assume simple parsing or that the agent writes JSON/YAML inside MD?
                // The spec says "Signal Types: REPLAN, REARCHITECT".
                // Let's assume the file content *is* the signal description, and we infer type from filename or content.
                // Or better, let's assume the agent writes a structured file.
                // The spec example shows a markdown file with headers.

                // Let's try to parse it.
                // For simplicity in this iteration, let's assume the filename contains the type, e.g., REPLAN_task-04.md
                let type: 'REPLAN' | 'REARCHITECT' = 'REPLAN';
                if (signalFile.includes('REARCHITECT')) {
                    type = 'REARCHITECT';
                }

                // We construct the signal object
                const signal: Signal = {
                    type: type,
                    source: signalFile, // Using filename as source/id for now
                    reason: content, // The whole content is the reason/context
                    timestamp: new Date().toISOString()
                };

                // Check for invalidation flag in content (simple string check)
                if (content.includes('invalidates_previous_work: true')) {
                    signal.invalidates_previous_work = true;
                }

                throw new SignalDetectedError(signal);
            }
        }
    }

    async executePlan(plan: Plan, userPrompt: string): Promise<void> {
        log(`Executing plan: ${plan.plan_name}`);
        this.taskPromises.clear();

        const tasksById = new Map<string, Task>();
        for (const task of plan.tasks) {
            if (!task.id) {
                task.id = `temp-${Math.random().toString(36).substring(7)}`;
                log(`Assigned temporary ID ${task.id} to task: ${task.message}`);
            }
            tasksById.set(task.id, task);
        }

        this.detectCycles(plan.tasks, tasksById);

        const executeTask = async (taskId: string): Promise<void> => {
            if (this.taskPromises.has(taskId)) {
                return this.taskPromises.get(taskId)!;
            }

            const task = tasksById.get(taskId);
            if (!task) {
                throw new Error(`Task ${taskId} not found in plan.`);
            }

            const promise = (async () => {
                if (task.dependencies && task.dependencies.length > 0) {
                    await Promise.all(task.dependencies.map(depId => executeTask(depId)));
                }

                log(`Starting task: ${task.message} (${task.id})`);
                try {
                    await this.agentRunner.runAgent(task, userPrompt);
                    log(`Completed task: ${task.message} (${task.id})`);
                    this.checkForSignals();
                } catch (e) {
                    log(`Failed task: ${task.message} (${task.id})`, e);
                    throw e;
                }
            })();

            this.taskPromises.set(taskId, promise);
            return promise;
        };

        try {
            await Promise.all(plan.tasks.map(t => executeTask(t.id)));
            log("Plan execution complete.");
        } catch (e) {
            console.error("Plan execution failed:", e);
            throw e;
        }
    }

    private detectCycles(tasks: Task[], tasksById: Map<string, Task>): void {
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const visit = (taskId: string) => {
            if (recursionStack.has(taskId)) {
                throw new Error(`Cycle detected involving task ${taskId}`);
            }
            if (visited.has(taskId)) {
                return;
            }

            visited.add(taskId);
            recursionStack.add(taskId);

            const task = tasksById.get(taskId);
            if (task && task.dependencies) {
                for (const depId of task.dependencies) {
                    visit(depId);
                }
            }

            recursionStack.delete(taskId);
        };

        for (const task of tasks) {
            visit(task.id);
        }
    }
}
