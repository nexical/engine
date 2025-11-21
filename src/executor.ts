import { Plan } from './data_models/Plan.js';
import { Task } from './data_models/Task.js';
import { AgentRunner } from './services/AgentRunner.js';
import { Project } from './data_models/Project.js';

export class Executor {
    constructor(
        private projectPath: string,
        private agentRunner: AgentRunner
    ) { }

    async executePlan(plan: Plan, userPrompt: string): Promise<void> {
        console.log(`Executing plan: ${plan.plan_name}`);
        let project: Project = { project_path: this.projectPath };

        const tasksById = new Map<string, Task>();
        const completedTasks = new Set<string>();
        const runningTasks = new Set<string>();

        // Index tasks by ID
        for (const task of plan.tasks) {
            if (task.id) {
                tasksById.set(task.id, task);
            } else {
                // Fallback for tasks without ID (shouldn't happen with new prompt, but safety first)
                // We can generate a temporary ID or just treat them as sequential if we handle them differently.
                // For now, let's assume IDs are present or we skip/fail.
                console.warn(`Task '${task.name}' is missing an ID. Assigning temporary ID.`);
                task.id = `temp-${Math.random().toString(36).substring(7)}`;
                tasksById.set(task.id, task);
            }
        }

        while (completedTasks.size < plan.tasks.length) {
            const executableTasks: Task[] = [];

            for (const task of plan.tasks) {
                if (completedTasks.has(task.id) || runningTasks.has(task.id)) {
                    continue;
                }

                const dependencies = task.dependencies || [];
                const allDependenciesMet = dependencies.every(depId => completedTasks.has(depId));

                if (allDependenciesMet) {
                    executableTasks.push(task);
                }
            }

            if (executableTasks.length === 0 && runningTasks.size === 0 && completedTasks.size < plan.tasks.length) {
                console.error("Deadlock detected! Some tasks cannot be executed due to missing dependencies or cycles.");
                break;
            }

            if (executableTasks.length === 0 && runningTasks.size > 0) {
                // Wait for some running tasks to finish
                await new Promise(resolve => setTimeout(resolve, 100)); // Simple polling for now
                continue;
            }

            // Execute tasks in parallel
            const promises = executableTasks.map(async (task) => {
                runningTasks.add(task.id);
                try {
                    project = await this.agentRunner.runAgent(task, project, userPrompt);
                    completedTasks.add(task.id);
                } catch (e) {
                    console.error(`Task '${task.name}' (ID: ${task.id}) failed:`, e);
                    // Depending on policy, we might want to stop everything or continue independent paths.
                    // For now, we'll treat it as completed (failed) to avoid infinite loops, but log heavily.
                    completedTasks.add(task.id);
                } finally {
                    runningTasks.delete(task.id);
                }
            });

            await Promise.all(promises);
        }

        console.log("Plan execution complete.");
    }
}
