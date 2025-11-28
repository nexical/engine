import path from 'path';
import debug from 'debug';
import yaml from 'js-yaml';
import { Orchestrator } from './orchestrator.js';
import { Plan, PlanUtils } from './models/Plan.js';
import { Agent } from './models/Agent.js';

const log = debug('planner');

export class Planner {
    private plannerPrompt: string

    constructor(
        private core: Orchestrator
    ) {
        const plannerPromptFile = 'planner.md';
        const corePlannerPrompt = path.join(this.core.config.appPath, 'prompts', plannerPromptFile);
        const projectPlannerPrompt = path.join(this.core.config.agentsPath, plannerPromptFile);

        if (this.core.disk.exists(projectPlannerPrompt)) {
            this.plannerPrompt = this.core.disk.readFile(projectPlannerPrompt);
        } else {
            this.plannerPrompt = this.core.disk.readFile(corePlannerPrompt);
        }
    }

    private getAgentCapabilities(): string {
        const capabilitiesPath = path.join(this.core.config.agentsPath, 'capabilities.yml');
        if (this.core.disk.exists(capabilitiesPath)) {
            return this.core.disk.readFile(capabilitiesPath);
        }
        return "No agent capabilities file found.";
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
        const filePath = path.join(this.core.config.historyPath, filename);

        const yamlContent = PlanUtils.toYaml(plan);
        this.core.disk.writeFile(filePath, yamlContent);
        log(`Saved plan history to: ${filePath}`);
    }

    async generatePlan(prompt: string): Promise<Plan> {
        const agentCapabilities = this.getAgentCapabilities();
        const plannerCliCommand = process.env.PLANNER_CLI_COMMAND || 'gemini';
        let plannerCliArgs: string[];

        if (process.env.PLANNER_CLI_ARGS) {
            plannerCliArgs = yaml.load(process.env.PLANNER_CLI_ARGS) as string[];
        } else {
            plannerCliArgs = ['prompt', '{prompt}', '--yolo'];
        }

        const planFile = '.plotris/history/plan.yml';
        const planFileWithPrefix = `@${planFile}`;

        const fullPrompt = this.plannerPrompt
            .replace('{user_prompt}', prompt)
            .replace('{agent_capabilities}', agentCapabilities)
            .replace('{plan_file}', planFileWithPrefix);

        const plannerAgent: Agent = {
            name: 'planner',
            command: plannerCliCommand,
            args: plannerCliArgs,
            prompt_template: '{prompt}' // The fullPrompt is already constructed
        };

        try {
            // Let's pass fullPrompt as 'prompt' in params.

            const plugin = this.core.agentRegistry.get('cli');
            if (!plugin) {
                throw new Error("CLI plugin not found for planner.");
            }

            // Execute the planner agent. It should write the plan to planFile.
            await plugin.execute(plannerAgent, '', {
                userPrompt: prompt,
                params: {
                    prompt: fullPrompt
                }
            });

            // Read the plan from the file
            const planContent = this.core.disk.readFile(path.join(this.core.config.projectPath, planFile));

            // Parse the YAML
            // Extract YAML block if wrapped in markdown
            let yamlContent = planContent;
            const yamlBlockMatch = planContent.match(/```yaml\n([\s\S]*?)\n```/) || planContent.match(/```\n([\s\S]*?)\n```/);

            if (yamlBlockMatch) {
                yamlContent = yamlBlockMatch[1];
            } else {
                // Try to find the start of the YAML object (plan_name:)
                const yamlStart = planContent.indexOf('plan_name:');
                if (yamlStart !== -1) {
                    yamlContent = planContent.substring(yamlStart);
                }
            }

            const plan = PlanUtils.fromYaml(yamlContent);
            this.savePlanToHistory(plan);
            return plan;

        } catch (e) {
            console.error("Error generating plan:", e);
            throw e;
        }
    }
}
