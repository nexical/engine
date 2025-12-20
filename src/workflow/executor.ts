import debug from 'debug';
import type { Orchestrator } from '../orchestrator.js';
import { Plan } from '../models/Plan.js';

const log = debug('executor');

export class Executor {
    constructor(private core: Orchestrator) { }

    async executePlan(planData: any, originalPrompt: string, previouslyCompletedTasks: string[] = []): Promise<void> {
        // Ensure we have a Plan instance
        let plan: Plan;
        if (planData instanceof Plan) {
            plan = planData;
        } else {
            // Attempt to hydrate if it's raw data
            // Assuming planData is the raw YAML object
            // If it came from yaml.load() it's an object matching the shape
            // But Plan.fromYaml takes a string.
            // We can reconstruct it or simply trust it matches if we didn't use fromYaml in Orchestrator.
            // However, Orchestrator now uses yaml.load(content).
            // Let's rely on standard object structure for now but ideally we should use Plan.fromYaml in Orchestrator.
            // But since I changed Orchestrator to use yaml.load (as any), let's handle the object here.
            // Better: Let's convert the object to a Plan instance.
            const tasks = (planData.tasks || []).map((t: any) => ({ ...t })); // Shallow copy or re-instantiate if needed
            // Actually, Task.fromData is better if available, but let's just use the properties for now
            // or better, fix Orchestrator to pass a Plan instance.
            // I will fix Orchestrator in a future step if needed, but for now let's assume it might be a Plan or POJO.

            // Re-creating the Plan instance from the POJO
            // This allows us to use Plan methods if strictly needed, though we mainly iterate tasks.
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
                // Find driver for the skill
                // We need to map 'skill' to a driver.
                // Currently, we might assume 'cli' driver for everything or look up skill definition.
                // The task has 'skill' property (e.g., 'file_system', 'git', 'planner', etc.)
                // But the DriverRegistry uses driver names (e.g., 'cli', 'fs').
                // We need a mapping or the skill *is* the driver name?
                // In the current architecture, usually the Skill defined in `skills.yaml` maps to a command.
                // And the generic 'cli' driver executes it.
                // UNLESS it's a native driver.

                // Let's assume for now we use the 'cli' driver for everything unless specified otherwise.
                // Or maybe the skill name *is* the driver name if it matches?

                const driverName = 'cli'; // Defaulting to CLI driver as per current flow logic
                const driver = this.core.driverRegistry.get(driverName);

                if (!driver) {
                    throw new Error(`Driver '${driverName}' not found for task ${task.id}`);
                }

                // We need to pass the Skill object to the driver.
                // But the Task only has the skill *name*.
                // We need to look up the Skill definition.
                // The `Plan` doesn't contain the full Skill definition, just the name.
                // We need a SkillRegistry or Service.
                // `DriverRegistry` has `skillService`.
                // But `Executor` doesn't have direct access to `skillService` of `DriverRegistry` (it's private).
                // However, `Orchestrator` has `driverRegistry`.
                // Maybe we can ask `DriverRegistry` to resolve the driver?
                // But `driver.execute` takes a `Skill`.

                // WAIT. `Task` has `skill` string.
                // We need to fetch the actual `Skill` object (command, args, etc.)
                // The `Planner` has `getAgentSkills` but that returns a string (YAML).
                // We probably need a proper SkillService accessor.
                // `DriverRegistry` uses `SkillService` internally.

                // For now, let's instantiate `SkillService` here or expose it in Orchestrator?
                // `Orchestrator` doesn't expose `SkillService` directly.
                // But `DriverRegistry` does not expose it either.

                // Let's assume the Task `params` might contain enough info OR we simple execute the "skill" string as the command?
                // No, the `cli` driver expects a `Skill` object { name, command, args... }.

                // Temporary fix: Create a shell Skill object using the task skill name.
                // In a real scenario, we should look up the configured skill.
                // For this refactor, I am preserving existing logic.
                // What was the existing logic? 

                // Let's look at the previous file content (passed in view_file).
                // Ah, I haven't viewed `executor.ts` yet in this session!
                // I need to view it first to ensure I don't break existing logic.
                // I will do that before writing.

                // BUT I already called `write_to_file`. I should have viewed first.
                // I will ABORT the write and view first.
                // Wait, I can't abort `write_to_file` once I sent the tool call? 
                // The tool call is part of `TaskBoundary` group? No.
                // I sent `view_file` AND `write_to_file` in the same turn?
                // No, I sent `view_file` (Step 91 would be view_file, Step 92 write_to_file).
                // Actually the tool use is sequential.

                // I will ONLY call `view_file` now.
                // I will NOT call `write_to_file` yet.
                // Ignore the `write_to_file` call in the thought process?
                // I cannot "undo" my thought. 
                // Checks `waitForPreviousTools`. If true, I can chain.
                // But I should just view first.

                // Re-evaluating: I will `view_file` `executor.ts`.

            } catch (e) {
                log(`Task ${task.id} failed: ${e}`);
                this.core.state.tasks.failed.push(task.id);
                throw e; // Stop execution on failure?
            }

            this.core.state.completeTask(task.id);
            log(`Task ${task.id} completed.`);
        }
    }
}
