import { Project } from '../domain/Project.js';
import { Workspace } from '../domain/Workspace.js';
import { Plan } from '../domain/Plan.js';
import { Architecture } from '../domain/Architecture.js';
import { AISkill } from '../drivers/base/AICLIDriver.js';
import { PromptEngine } from '../services/PromptEngine.js';
import { DriverRegistry } from '../drivers/Registry.js';
import { SkillRunner } from '../services/SkillRunner.js';
import { EvolutionService } from '../services/EvolutionService.js';

export class PlannerAgent {
    constructor(
        private project: Project,
        private workspace: Workspace,
        private promptEngine: PromptEngine,
        private driverRegistry: DriverRegistry,
        private skillRunner: SkillRunner,
        private evolutionService: EvolutionService
    ) { }

    public async plan(architecture: Architecture, userRequest: string): Promise<Plan> {
        const constraints = this.project.getConstraints();
        const evolutionLog = this.evolutionService.getLogSummary();

        const agentSkills = JSON.stringify(this.skillRunner.getSkills(), null, 2);

        const fullPrompt = this.promptEngine.render(this.project.paths.plannerPrompt, {
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

        const driver = this.driverRegistry.get('gemini') || this.driverRegistry.getDefault();
        if (!driver) throw new Error("No driver available for Planner.");

        const result = await driver.execute(plannerSkill, {
            userPrompt: userRequest,
            params: {
                prompt: fullPrompt
            }
        });

        if (result.isFail()) {
            throw result.error();
        }

        // Reload plan
        const plan = await this.workspace.loadPlan();
        return plan;
    }
}
