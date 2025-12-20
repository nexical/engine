import debug from 'debug';
import { Plan } from '../models/Plan.js';
import { Task } from '../models/Task.js';
import type { Orchestrator } from '../orchestrator.js';
import { SkillRunner } from '../services/SkillRunner.js';
import fs from 'fs-extra';
import path from 'path';
import { Signal } from '../models/State.js';
import { SignalDetectedError } from '../errors/SignalDetectedError.js';
const log = debug('executor');

export class Executor {
    private skillRunner: SkillRunner;
    private taskPromises: Map<string, Promise<void>> = new Map();

    constructor(
        private core: Orchestrator
    ) {
        this.skillRunner = new SkillRunner(this.core);
    }

    private checkForSignals(): void {
        const signalsPath = path.join(this.core.config.nexicalPath, 'signals');
        if (fs.existsSync(signalsPath)) {
            const files = fs.readdirSync(signalsPath);
            if (files.length > 0) {
                // Sort signals: REARCHITECT > REPLAN, then by timestamp (oldest first)
                // Assuming filename format or just content inspection. 
                // Since we don't have strict filename format yet, let's prioritize based on name inclusion.
                files.sort((a, b) => {
                    const aIsRearchitect = a.includes('REARCHITECT');
                    const bIsRearchitect = b.includes('REARCHITECT');
                    if (aIsRearchitect && !bIsRearchitect) return -1;
                    if (!aIsRearchitect && bIsRearchitect) return 1;
                    // If same type, sort by name (timestamp usually in name)
                    return a.localeCompare(b);
                });

                const signalFile = files[0];
                const content = fs.readFileSync(path.join(signalsPath, signalFile), 'utf8');

                let type: 'REPLAN' | 'REARCHITECT' = 'REPLAN';
                if (signalFile.includes('REARCHITECT')) {
                    type = 'REARCHITECT';
                }

                const signal: Signal = {
                    type: type,
                    source: signalFile,
                    reason: content,
                    timestamp: new Date().toISOString()
                };

                if (content.includes('invalidates_previous_work: true')) {
                    signal.invalidates_previous_work = true;
                }

                throw new SignalDetectedError(signal);
            }
        }
    }

    async executePlan(plan: Plan, userPrompt: string, completedTaskIds: string[] = []): Promise<void> {
        log(`Executing plan: ${plan.plan_name}`);
        this.taskPromises.clear();

        const tasksById = new Map<string, Task>();
        for (const task of plan.tasks) {
            if (!task.id) {
                throw new Error(`Task missing ID: ${task.message}. All tasks must have a unique ID.`);
            }
            tasksById.set(task.id, task);
        }

        this.detectCycles(plan.tasks, tasksById);

        const executeTask = async (taskId: string): Promise<void> => {
            if (completedTaskIds.includes(taskId)) {
                log(`Skipping completed task: ${taskId}`);
                return;
            }

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

                // Double check if dependencies execution marked this as completed (unlikely but safe)
                if (completedTaskIds.includes(taskId)) {
                    return;
                }

                log(`Starting task: ${task.message} (${task.id})`);
                try {
                    await this.skillRunner.runSkill(task, userPrompt);
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
