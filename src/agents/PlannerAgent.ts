import { Architecture } from '../domain/Architecture.js';
import { Plan } from '../domain/Plan.js';
import { IProject } from '../domain/Project.js';
import { IRuntimeHost } from '../domain/RuntimeHost.js';
import { IWorkspace } from '../domain/Workspace.js';
import { IEvolutionService } from '../services/EvolutionService.js';
import { ISkillRunner } from '../services/SkillRunner.js';

export class PlannerAgent {
  constructor(
    private project: IProject,
    private workspace: IWorkspace,
    private skillRunner: ISkillRunner,
    private evolutionService: IEvolutionService,
    private host: IRuntimeHost,
  ) {}

  public async plan(architecture: Architecture, userRequest: string): Promise<Plan> {
    const constraints = this.project.getConstraints();
    const evolutionLog = this.evolutionService.getLogSummary();

    const agentSkills = JSON.stringify(this.skillRunner.getSkills(), null, 2);

    const params = {
      ...this.project.getConfig(),
      user_prompt: userRequest,
      agent_skills: agentSkills,
      plan_file: this.project.paths.planCurrent,
      architecture: architecture.data, // Pass structured data if prompt supports it, or use .raw
      global_constraints: constraints,
      personas_dir: this.project.paths.personas,
      active_signal: 'None',
      completed_tasks: 'None',
      evolution_log: evolutionLog,
    };

    let planStr: string;
    try {
      planStr = await this.skillRunner.executeNativeSkill('planner', params, userRequest);
    } catch (e) {
      throw e instanceof Error ? e : new Error('Planner execution failed');
    }

    try {
      const plan = Plan.fromYaml(planStr);
      await this.workspace.savePlan(plan);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      this.host.log('error', `Failed to parse plan YAML: ${error.message}\nContent: ${planStr}`);
      throw error;
    }

    // Reload plan
    const reloaded = await this.workspace.loadPlan();
    return reloaded;
  }
}
