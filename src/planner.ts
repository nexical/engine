import path from 'path';
import { spawnSync } from 'child_process';
import { Plan, PlanUtils } from './data_models/Plan.js';
import { FileSystemService } from './services/FileSystemService.js';

export class Planner {
    constructor(private fsService: FileSystemService) { }

    private getAgentCapabilities(projectPath: string): string {
        const capabilitiesPath = path.join(projectPath, '.builder', 'agents', 'capabilities.yml');
        if (this.fsService.exists(capabilitiesPath)) {
            return this.fsService.readFile(capabilitiesPath);
        }
        return "No agent capabilities file found.";
    }

    generatePlan(prompt: string, projectPath: string): Plan {
        const agentCapabilities = this.getAgentCapabilities(projectPath);

        const fullPrompt = `
You are an AI Architect. Your job is to create a deterministic YAML plan to accomplish a user's goal.
The user's prompt is: "${prompt}"

Here are the tools (agents) you have available:
---
${agentCapabilities}
---

Based on the user's prompt and the available agents, please generate a YAML plan.
The plan should be a sequence of tasks. Each task must use one of the available agents.
The output must be only the YAML plan, starting with 'plan_name:'.
`;

        console.log("Generating plan for prompt:", prompt);

        // Execute gemini CLI directly
        // Assuming 'gemini' is in the PATH or we use a specific command
        const command = 'gemini';
        const args = ['prompt', fullPrompt];

        console.log(`Running CLI for planning: ${command} ...`);

        try {
            const result = spawnSync(command, args, {
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe']
            });

            if (result.status !== 0) {
                console.error("Planner CLI failed:", result.stderr);
                throw new Error(`Planner CLI exited with code ${result.status}`);
            }

            const planYaml = result.stdout;
            return PlanUtils.fromYaml(planYaml);

        } catch (e) {
            console.error("Error generating plan:", e);
            throw e;
        }
    }
}
