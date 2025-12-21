import debug from 'debug';
import type { Orchestrator } from '../orchestrator.js';
import { Plan } from '../models/Plan.js';

const log = debug('executor');

export class Executor {
    constructor(private core: Orchestrator) { }

    async executePlan(planData: any, originalPrompt: string, previouslyCompletedTasks: string[] = []): Promise<void> {
        let plan: Plan;
        if (planData instanceof Plan) {
            plan = planData;
        } else {
            plan = new Plan(planData.plan_name, planData.tasks);
        }

        log(`Executing plan: ${plan.plan_name} with ${plan.tasks.length} tasks.`);

        // Filter out completed tasks
        const tasksToExecute = plan.tasks.filter(task => !previouslyCompletedTasks.includes(task.id));

        if (tasksToExecute.length === 0) {
            log("All tasks in plan are already completed.");
            return;
        }

        for (const task of tasksToExecute) {
            log(`Starting task: ${task.id} - ${task.message}`);

            // Resolve dependencies
            if (task.dependencies && task.dependencies.length > 0) {
                const missingDeps = task.dependencies.filter(depId => !previouslyCompletedTasks.includes(depId));
                if (missingDeps.length > 0) {
                    log(`Skipping task ${task.id} due to missing dependencies: ${missingDeps.join(', ')}`);
                    continue;
                }
            }

            try {
                // Delegate execution to SkillRunner
                await this.core.skillRunner.runSkill(task, originalPrompt);

            } catch (e) {
                log(`Task ${task.id} failed: ${e}`);
                this.core.state.tasks.failed.push(task.id);
                // We stop execution of the plan on the first failure to allow for replanning
                throw e;
            }

            this.core.state.completeTask(task.id);
            log(`Task ${task.id} completed.`);
        }
    }
}
