import { Brain } from '../brain/Brain.js';
import { Project } from '../domain/Project.js';
import { Workspace } from '../domain/Workspace.js';
import { PlanDocument } from '../artifacts/PlanDocument.js';
import { ArchitectureDocument } from '../artifacts/ArchitectureDocument.js';
import { AISkill } from '../../drivers/base/AICLIDriver.js';

export class PlannerAgent {
    constructor(
        private brain: Brain,
        private project: Project,
        private workspace: Workspace
    ) { }

    public async plan(architecture: ArchitectureDocument, userRequest: string): Promise<PlanDocument> {
        const constraints = this.project.getConstraints();
        const evolutionLog = "No historical failures recorded."; // Todo: implement

        // We need agent skills. 
        // In original PlannerAgent: context.skillRunner.getSkills()
        // We need a way to access SkillRunner. Brain has PromptEngine and DriverRegistry.
        // SkillRunner is in services/SkillRunner.ts.
        // Brain should probably hold SkillRunner too.
        // For now, let's stub it or access via Brain if we add it.
        const agentSkills = "[]"; // Placeholder

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
