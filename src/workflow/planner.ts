import path from 'path';
import debug from 'debug';
import yaml from 'js-yaml';
import type { Orchestrator } from '../orchestrator.js';
import { Plan, PlanUtils } from '../models/Plan.js';
import { Agent } from '../models/Agent.js';
import { Signal } from '../models/State.js';

const log = debug('planner');

export class Planner {
    constructor(private core: Orchestrator) { }

    private getAgentCapabilities(): string {
        const capabilitiesPath = this.core.config.capabilitiesPath;
        if (this.core.disk.exists(capabilitiesPath)) {
            return this.core.disk.readFile(capabilitiesPath);
        }
        return "No agent capabilities file found.";
    }

    private getArchitecture(): string {
        const architecturePath = this.core.config.architecturePath;
        if (this.core.disk.exists(architecturePath)) {
            return this.core.disk.readFile(architecturePath);
        }
        return "There is no architecture defined.";
    }

    private getGlobalConstraints(): string {
        const agentsMdPath = this.core.config.agentsDefinitionPath;
        if (this.core.disk.exists(agentsMdPath)) {
            return this.core.disk.readFile(agentsMdPath);
        }
        return "There are no global constraints defined.";
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
        const filePath = path.join(this.core.config.historyPath, filename);

        const yamlContent = PlanUtils.toYaml(plan);
        this.core.disk.writeFileAtomic(filePath, yamlContent);
        log(`Saved plan history to: ${filePath}`);
    }

    async generatePlan(prompt: string, activeSignal?: Signal, completedTasks: string[] = []): Promise<Plan> {
        const architecture = this.getArchitecture();
        const globalConstraints = this.getGlobalConstraints();
        const agentCapabilities = this.getAgentCapabilities();
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

        const plannerCliCommand = process.env.PLANNER_CLI_COMMAND || 'gemini';
        let plannerCliArgs: string[];

        if (process.env.PLANNER_CLI_ARGS) {
            plannerCliArgs = yaml.load(process.env.PLANNER_CLI_ARGS) as string[];
        } else {
            plannerCliArgs = ['prompt', '{prompt}', '--yolo'];
        }

        const planFile = this.core.config.planPath;
        const personasDir = this.core.config.personasPath;

        const fullPrompt = this.core.promptEngine.render('planner.md', {
            user_prompt: prompt,
            agent_capabilities: agentCapabilities,
            plan_file: planFile,
            architecture: architecture,
            global_constraints: globalConstraints,
            personas_dir: personasDir,
            active_signal: activeSignalText,
            completed_tasks: completedTasksText,
            evolution_log: evolutionLog
        });

        const plannerAgent: Agent = {
            name: 'planner',
            command: plannerCliCommand,
            args: plannerCliArgs,
            prompt_template: '{prompt}' // The fullPrompt is already constructed
        };

        if (this.core.identityManager && this.core.jobContext) {
            try {
                const { teamId, projectId, jobId } = this.core.jobContext;
                const token = await this.core.identityManager.getAgentToken(teamId, projectId, jobId);
                if (token) {
                    process.env.NEXICAL_AGENT_TOKEN = token;
                }
            } catch (e) {
                console.error("Failed to get agent token for planner:", e);
            }
        }

        try {
            const skill = this.core.skillRegistry.get('cli');
            if (!skill) {
                throw new Error("CLI skill not found for planner.");
            }

            // Execute the planner agent. It should write the plan to planFile.
            await skill.execute(plannerAgent, '', {
                userPrompt: prompt,
                params: {
                    prompt: fullPrompt
                },
                // We could pass env here if we modify calling code, but for now 
                // modifying process.env or CLIAgentPlugin modification is better.
                // We modified CLIAgentPlugin to use context.env via ShellExecutor.
                env: process.env.NEXICAL_AGENT_TOKEN ? { NEXICAL_AGENT_TOKEN: process.env.NEXICAL_AGENT_TOKEN } : {}
            });

            // Read the plan from the file
            const planContent = this.core.disk.readFile(this.core.config.planPath);
            const plan = PlanUtils.fromYaml(planContent);

            this.savePlanToHistory(plan);
            return plan;

        } catch (e) {
            console.error("Error generating plan:", e);
            throw e;
        }
    }
}
