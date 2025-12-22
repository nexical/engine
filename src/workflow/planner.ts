import path from 'path';
import type { Orchestrator } from '../orchestrator.js';
import yaml from 'js-yaml';
import { Plan } from '../models/Plan.js';
import { Signal } from '../interfaces/Signal.js';
import { AISkill } from '../drivers/base/AICLIDriver.js';
import { GeminiDriver } from '../drivers/GeminiDriver.js';

export class Planner {
    constructor(private core: Orchestrator) { }

    private getGlobalConstraints(): string {
        const constraintsPath = this.core.config.constraintsPath;
        if (this.core.disk.exists(constraintsPath)) {
            return this.core.disk.readFile(constraintsPath);
        }
        return "There are no global constraints defined.";
    }

    private getAgentSkills(): string {
        const skills = this.core.skillRunner.getSkills();
        const simplifiedSkills = skills.map(skill => ({
            name: skill.name,
            description: skill.description,
            dependencies: skill.dependencies
        }));
        return yaml.dump(simplifiedSkills);
    }

    private getArchitecture(): string {
        const architecturePath = this.core.config.architecturePath;
        if (this.core.disk.exists(architecturePath)) {
            return this.core.disk.readFile(architecturePath);
        }
        return "There is no architecture defined.";
    }

    private getEvolutionLog(): string {
        const logPath = this.core.config.logPath;
        if (this.core.disk.exists(logPath)) {
            return this.core.disk.readFile(logPath);
        }
        return "No historical failures recorded.";
    }

    private savePlanToHistory(plan: Plan): void {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        const filename = `plan-${year}-${month}-${day}.${hours}-${minutes}-${seconds}.yml`;
        const filePath = path.join(this.core.config.planDirectory, filename);

        const yamlContent = plan.toYaml();
        this.core.disk.writeFileAtomic(filePath, yamlContent);
        this.core.host.log('debug', `Saved plan history to: ${filePath}`);
    }

    async generatePlan(prompt: string, activeSignal?: Signal, completedTasks: string[] = []): Promise<Plan> {
        const architecture = this.getArchitecture();
        const globalConstraints = this.getGlobalConstraints();
        const agentSkills = this.getAgentSkills();
        const evolutionLog = this.getEvolutionLog();

        let activeSignalText = "None";
        if (activeSignal) {
            activeSignalText = `
**Type:** ${activeSignal.type}
**Source:** ${activeSignal.source}
**Timestamp:** ${activeSignal.timestamp}

**Reason/Context:**
${activeSignal.reason}
`;
        }

        let completedTasksText = "None";
        if (completedTasks && completedTasks.length > 0) {
            completedTasksText = completedTasks.map(t => `- ${t}`).join('\n');
        }

        const planFile = this.core.config.planPath;
        const personasDir = this.core.config.personasDirectory;

        const fullPrompt = this.core.promptEngine.render(this.core.config.plannerPromptFile, {
            user_prompt: prompt,
            agent_skills: agentSkills,
            plan_file: planFile,
            architecture: architecture,
            global_constraints: globalConstraints,
            personas_dir: personasDir,
            active_signal: activeSignalText,
            completed_tasks: completedTasksText,
            evolution_log: evolutionLog
        });

        const plannerAgent: AISkill = {
            name: 'planner',
            prompt_template: '{prompt}' // The fullPrompt is already constructed
        };

        try {
            const driver = this.core.driverRegistry.get('gemini') as GeminiDriver;
            await driver.execute(plannerAgent, {
                userPrompt: prompt,
                params: {
                    prompt: fullPrompt
                }
            });

            // Read the plan from the file
            const planContent = this.core.disk.readFile(this.core.config.planPath);
            const plan = Plan.fromYaml(planContent);

            this.savePlanToHistory(plan);
            return plan;

        } catch (e) {
            this.core.host.log('error', `Error generating plan: ${e}`);
            throw e;
        }
    }
}
