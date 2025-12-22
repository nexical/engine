import { IProject } from '../domain/Project.js';
import { IWorkspace } from '../domain/Workspace.js';
import { Plan } from '../domain/Plan.js';
import { Architecture } from '../domain/Architecture.js';
import { AISkill } from '../drivers/base/AICLIDriver.js';
import { IPromptEngine } from '../services/PromptEngine.js';
import { IDriverRegistry } from '../drivers/DriverRegistry.js';
import { ISkillRunner } from '../services/SkillRunner.js';
import { IEvolutionService } from '../services/EvolutionService.js';

export class PlannerAgent {
    constructor(
        private project: IProject,
        private workspace: IWorkspace,
        private promptEngine: IPromptEngine,
        private driverRegistry: IDriverRegistry,
        private skillRunner: ISkillRunner,
        private evolutionService: IEvolutionService
    ) { }

    public async plan(architecture: Architecture, userRequest: string): Promise<Plan> {
        const constraints = this.project.getConstraints();
        const evolutionLog = this.evolutionService.getLogSummary();

        const agentSkills = JSON.stringify(this.skillRunner.getSkills(), null, 2);

        const fullPrompt = this.promptEngine.render(this.project.paths.plannerPrompt, {
            user_prompt: userRequest,
            agent_skills: agentSkills,
            plan_file: this.project.paths.planCurrent,
            architecture: architecture.data, // Pass structured data if prompt supports it, or use .raw
            global_constraints: constraints,
            personas_dir: this.project.paths.personas,
            active_signal: "None",
            completed_tasks: "None",
            evolution_log: evolutionLog
        });

        const agentConfig = this.project.getConfig().agents?.['planner'];
        const skillName = agentConfig?.skill || 'planner';
        const driverName = agentConfig?.driver || 'gemini';

        const plannerSkill: AISkill = {
            name: skillName,
            prompt_template: '{prompt}'
        };

        const driver = this.driverRegistry.get(driverName) || this.driverRegistry.getDefault();
        if (!driver) throw new Error(`No driver available for Planner (requested: ${driverName}).`);

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
