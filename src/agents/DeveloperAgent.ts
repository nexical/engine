import yaml from 'js-yaml';
import { Brain } from './Brain.js';
import { Project } from '../domain/Project.js';
import { EngineState } from '../domain/State.js';
import { Plan } from '../domain/Plan.js';

export class DeveloperAgent {
    public readonly name = 'Developer';
    public readonly description = 'Executes the implementation plan by running skills.';

    constructor(
        private brain: Brain,
        private project: Project
    ) { }

    async execute(state: EngineState): Promise<void> {
        const prompt = state.user_prompt;

        // Load Plan from Project paths
        // We assume the plan is in the "current" plan file or passed in state? 
        // Legacy agent read from config.planPath.
        // Project.paths.planCurrent is the equivalent.

        // Wait, Project structure has `paths.plan` (dir) and `paths.planCurrent` (file).
        const planPath = this.project.paths.planCurrent;

        // We can't use `this.project.disk` directly as it's private.
        // We should usage `fs-extra` or a public accessor.
        // Since `Workspace` manages artifacts, maybe we should ask Workspace for the plan?
        // But for now, let's just read the file using fs-extra or similar.
        // Or we can assume `state` might have the plan loaded?
        // Legacy agent loaded it from file.

        // Let's use fs-extra for now to keep it simple and internal.
        const fs = require('fs-extra');

        if (!fs.existsSync(planPath)) {
            throw new Error(`Plan file not found at ${planPath}`);
        }

        const planContent = fs.readFileSync(planPath, 'utf8');
        const planData = yaml.load(planContent) as any;
        let plan: Plan;
        if (planData instanceof Plan) {
            plan = planData; // Unlikely from YAML load
        } else {
            plan = new Plan(planData.plan_name, planData.tasks);
        }

        console.log(`[INFO] Executing plan: ${plan.plan_name} with ${plan.tasks.length} tasks.`);

        // Filter out completed tasks
        const tasksToExecute = plan.tasks.filter(task => !state.tasks.completed.includes(task.id));

        if (tasksToExecute.length === 0) {
            console.log("[INFO] All tasks in plan are already completed.");
            return;
        }

        const skillRunner = this.brain.getSkillRunner();

        for (const task of tasksToExecute) {
            console.log(`[INFO] Starting task: ${task.id} - ${task.message}`);

            // Resolve dependencies
            if (task.dependencies && task.dependencies.length > 0) {
                const missingDeps = task.dependencies.filter(depId => !state.tasks.completed.includes(depId));
                if (missingDeps.length > 0) {
                    console.warn(`[WARN] Skipping task ${task.id} due to missing dependencies: ${missingDeps.join(', ')}`);
                    continue;
                }
            }

            try {
                // Delegate execution to SkillRunner
                await skillRunner.runSkill(task, prompt);

            } catch (e) {
                console.error(`[ERROR] Task ${task.id} failed: ${e}`);
                state.tasks.failed.push(task.id);
                // We stop execution of the plan on the first failure to allow for replanning
                throw e;
            }

            state.completeTask(task.id);
            console.log(`[INFO] Task ${task.id} completed.`);
        }
    }
}
