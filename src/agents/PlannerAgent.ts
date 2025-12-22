import { Brain } from './Brain.js';
import { Project } from '../domain/Project.js';
import { Workspace } from '../domain/Workspace.js';
import { Plan } from '../domain/Plan.js';
import { Architecture } from '../domain/Architecture.js';
import { AISkill } from '../drivers/base/AICLIDriver.js';

export class PlannerAgent {
    constructor(
        private brain: Brain,
        private project: Project,
        private workspace: Workspace
    ) { }

    public async plan(architecture: Architecture, userRequest: string): Promise<Plan> {
        const constraints = this.project.getConstraints();
        const evolutionLog = this.brain.getEvolution().getLogSummary();

        const agentSkills = JSON.stringify(this.brain.getSkillRunner().getSkills(), null, 2);

        const fullPrompt = this.brain.getPromptEngine().render(this.project.paths.plannerPrompt, {
            user_prompt: userRequest,
            agent_skills: agentSkills,
            plan_file: this.project.paths.planCurrent,
            architecture: architecture.content,
            global_constraints: constraints,
            personas_dir: this.project.paths.personas,
            active_signal: "None",
            completed_tasks: "None",
            evolution_log: evolutionLog
        });

        const plannerSkill: AISkill = {
            name: 'planner',
            prompt_template: '{prompt}'
        };

        const driver = this.brain.getDriver('gemini') || this.brain.getDefaultDriver();
        if (!driver) throw new Error("No driver available for Planner.");

        await driver.execute(plannerSkill, {
            userPrompt: userRequest,
            params: {
                prompt: fullPrompt
            }
        });

        // Reload plan
        const plan = await this.workspace.loadPlan();
        return plan;
    }
}
