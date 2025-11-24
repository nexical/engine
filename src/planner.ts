import path from 'path';
import debug from 'debug';
import { AppConfig } from './data_models/AppConfig.js';
import { Plan, PlanUtils } from './data_models/Plan.js';
import { FileSystemService } from './services/FileSystemService.js';
import { ShellExecutor } from './utils/ShellExecutor.js';

const log = debug('planner');

export class Planner {
    private plannerPrompt: string
    private fsService: FileSystemService

    constructor(private config: AppConfig) {
        const plannerPromptFile = 'planner.md';
        const corePlannerPrompt = path.join(this.config.appPath, 'prompts', plannerPromptFile);
        const projectPlannerPrompt = path.join(this.config.agentsPath, plannerPromptFile);

        this.fsService = new FileSystemService();

        if (this.fsService.exists(projectPlannerPrompt)) {
            this.plannerPrompt = this.fsService.readFile(projectPlannerPrompt);
        } else {
            this.plannerPrompt = this.fsService.readFile(corePlannerPrompt);
        }
    }

    private getAgentCapabilities(): string {
        const capabilitiesPath = path.join(this.config.agentsPath, 'capabilities.yml');
        if (this.fsService.exists(capabilitiesPath)) {
            return this.fsService.readFile(capabilitiesPath);
        }
        return "No agent capabilities file found.";
    }

    generatePlan(prompt: string): Plan {
        const agentCapabilities = this.getAgentCapabilities();

        const fullPrompt = this.plannerPrompt.replace('{user_prompt}', prompt)
            .replace('{agent_capabilities}', agentCapabilities);

        log("Generating plan for prompt:", prompt);

        const command = 'gemini';
        const args = ['prompt', fullPrompt];

        try {
            const result = ShellExecutor.executeSync(command, args, {
                cwd: this.config.projectPath
            });

            if (result.code !== 0) {
                console.error("Planner CLI failed:", result.stderr);
                throw new Error(`Planner CLI exited with code ${result.code}`);
            }

            let planYaml = result.stdout;
            // Strip markdown code blocks if present
            planYaml = planYaml.replace(/```yaml\n/g, '').replace(/```\n/g, '').replace(/```/g, '');
            return PlanUtils.fromYaml(planYaml);

        } catch (e) {
            console.error("Error generating plan:", e);
            throw e;
        }
    }
}
