import { Plan } from './data_models/Plan.js';
import { AgentRunner } from './services/AgentRunner.js';
import { Project } from './data_models/Project.js';

export class Executor {
    constructor(
        private projectPath: string,
        private agentRunner: AgentRunner
    ) { }

    executePlan(plan: Plan, userPrompt: string): void {
        console.log(`Executing plan: ${plan.plan_name}`);
        let project: Project = { project_path: this.projectPath };

        for (const task of plan.tasks) {
            project = this.agentRunner.runAgent(task, project, userPrompt);
        }

        console.log("Plan execution complete.");
    }
}
