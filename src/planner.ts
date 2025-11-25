import path from 'path';
import debug from 'debug';
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

        const fullPrompt = this.plannerPrompt.replace('{user_prompt}', prompt)
            .replace('{agent_capabilities}', agentCapabilities);

        log("Generating plan for prompt:", prompt);

        const plannerAgent: Agent = {
            name: 'planner',
            command: process.env.PLANNER_CLI_COMMAND || 'gemini',
            args: ['prompt', '{prompt}'],
            prompt_template: '{prompt}' // The fullPrompt is already constructed
        };

        const plugin = this.core.agentRegistry.getDefault();
        if (!plugin) {
            throw new Error("No default agent plugin registered.");
        }

        try {
            // We pass fullPrompt as the "userPrompt" in context, but since we set prompt_template to {prompt},
            // and we pass fullPrompt as 'prompt' in params (via context override if we want, or just rely on formatArgs).
            // Wait, GeminiAgentPlugin uses 'task_prompt' as 'task_prompt' and 'user_request' as 'user_request'.
            // And it interpolates {prompt} from formatArgs['prompt'].
            // In GeminiAgentPlugin: formatArgs['prompt'] = prompt (which is interpolated promptTemplate).

            // Let's look at GeminiAgentPlugin again.
            // prompt = promptTemplate.replace(...)
            // formatArgs['prompt'] = prompt

            // So if promptTemplate is '{prompt}', then prompt becomes formatArgs['prompt'].
            // But formatArgs['prompt'] is overwritten later by the interpolated prompt? No.
            // formatArgs['prompt'] is assigned the result of interpolation.

            // So we need to pass 'prompt' in formatArgs.
            // GeminiAgentPlugin constructs formatArgs from context.params, user_request, etc.
            // It doesn't seem to have a direct 'prompt' input from the caller except via params.

            // Let's pass fullPrompt as 'prompt' in params.

            const result = await plugin.execute(plannerAgent, '', {
                params: {
                    prompt: fullPrompt
                }
            });

            const planYaml = result.replace(/```yaml\n/g, '').replace(/```\n/g, '').replace(/```/g, '');
            const plan = PlanUtils.fromYaml(planYaml);

            this.savePlanToHistory(plan);
            return plan;

        } catch (e) {
            console.error("Error generating plan:", e);
            throw e;
        }
    }
}
