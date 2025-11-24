import debug from 'debug';
import { Plan } from './data_models/Plan.js';
import { Task } from './data_models/Task.js';
import { AppConfig } from './data_models/AppConfig.js';
import { AgentRunner } from './services/AgentRunner.js';

const log = debug('executor');

export class Executor {
    private agentRunner: AgentRunner;
    private taskPromises: Map<string, Promise<void>> = new Map();

    constructor(
        private config: AppConfig,
        agentRunner?: AgentRunner
    ) {
        this.agentRunner = agentRunner || new AgentRunner(this.config);
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
