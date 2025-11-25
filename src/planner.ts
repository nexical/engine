import path from 'path';
import debug from 'debug';
import { Application } from './models/Application.js';
import { Plan, PlanUtils } from './models/Plan.js';
import { FileSystemService } from './services/FileSystemService.js';
import { AgentRegistry } from './plugins/AgentRegistry.js';
import { Agent } from './models/Agent.js';

const log = debug('planner');

export class Planner {
    private plannerPrompt: string
    private fsService: FileSystemService

    constructor(
        private config: Application,
        private agentRegistry: AgentRegistry
    ) {
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

    async generatePlan(prompt: string): Promise<Plan> {
        const agentCapabilities = this.getAgentCapabilities();

        const fullPrompt = this.plannerPrompt.replace('{user_prompt}', prompt)
            .replace('{agent_capabilities}', agentCapabilities);

        log("Generating plan for prompt:", prompt);

        const plannerAgent: Agent = {
            name: 'planner',
            command: 'gemini',
            args: ['prompt', '{prompt}'],
            prompt_template: '{prompt}' // The fullPrompt is already constructed
        };

        const plugin = this.agentRegistry.getDefault();
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

            let planYaml = result;
            // Strip markdown code blocks if present
            planYaml = planYaml.replace(/```yaml\n/g, '').replace(/```\n/g, '').replace(/```/g, '');
            return PlanUtils.fromYaml(planYaml);

        } catch (e) {
            console.error("Error generating plan:", e);
            throw e;
        }
    }
}
