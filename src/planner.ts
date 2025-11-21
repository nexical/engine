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

        const promptPath = path.join(process.cwd(), 'prompts', 'planner.md');
        let fullPrompt = this.fsService.readFile(promptPath);

        if (!fullPrompt) {
            throw new Error(`Planner prompt not found at ${promptPath}`);
        }

        fullPrompt = fullPrompt.replace('{user_prompt}', prompt)
            .replace('{agent_capabilities}', agentCapabilities);

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
