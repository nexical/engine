import yaml from 'js-yaml';
import { Brain } from './Brain.js';
import { Project } from '../domain/Project.js';
import { Workspace } from '../domain/Workspace.js';
import { EngineState } from '../domain/State.js';
import { Plan } from '../domain/Plan.js';
import { SignalDetectedError } from '../errors/SignalDetectedError.js';

export class DeveloperAgent {
    public readonly name = 'Developer';
    public readonly description = 'Executes the implementation plan by running skills.';

    constructor(
        private brain: Brain,
        private project: Project,
        private workspace: Workspace
    ) { }

    async execute(state: EngineState): Promise<void> {
        const prompt = state.user_prompt;

        // Load Plan using Workspace instead of direct fs access
        const plan = await this.workspace.loadPlan();

        this.brain.host.log('info', `Executing plan: ${plan.plan_name} with ${plan.tasks.length} tasks.`);

        // Filter out completed tasks
        const tasksToExecute = plan.tasks.filter(task => !state.tasks.completed.includes(task.id));

        if (tasksToExecute.length === 0) {
            this.brain.host.log('info', "All tasks in plan are already completed.");
            return;
        }

        const skillRunner = this.brain.getSkillRunner();

        for (const task of tasksToExecute) {
            this.brain.host.log('info', `Starting task: ${task.id} - ${task.message}`);

            // Resolve dependencies
            if (task.dependencies && task.dependencies.length > 0) {
                const missingDeps = task.dependencies.filter(depId => !state.tasks.completed.includes(depId));
                if (missingDeps.length > 0) {
                    this.brain.host.log('warn', `Skipping task ${task.id} due to missing dependencies: ${missingDeps.join(', ')}`);
                    continue;
                }
            }

            try {
                // Delegate execution to SkillRunner
                await skillRunner.runSkill(task, prompt);

            } catch (e) {
                this.brain.host.log('error', `Task ${task.id} failed: ${e}`);
                state.tasks.failed.push(task.id);
                // We stop execution of the plan on the first failure to allow for replanning
                throw e;
            }

            state.completeTask(task.id);
            this.brain.host.log('info', `Task ${task.id} completed.`);

            // Check for signals after each task
            await this.checkSignals(task.id);
        }
    }

    private async checkSignals(taskId: string): Promise<void> {
        const signal = await this.workspace.detectSignal();
        if (signal) {
            this.brain.host.log('info', `Signal detected after task ${taskId}: ${signal.type}`);
            throw new SignalDetectedError(signal, taskId);
        }
    }
}
