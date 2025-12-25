import { v4 as uuidv4 } from 'uuid';

import { Architecture } from '../domain/Architecture.js';
import { Plan } from '../domain/Plan.js';
import { IProject } from '../domain/Project.js';
import { IRuntimeHost } from '../domain/RuntimeHost.js';
import { ISkillContext } from '../domain/SkillConfig.js';
import { IWorkspace } from '../domain/Workspace.js';
import { DriverRegistry } from '../drivers/DriverRegistry.js';
import { IEvolutionService } from '../services/EvolutionService.js';
import { FileSystemBus } from '../services/FileSystemBus.js';
import { PlanGraphValidator } from '../services/PlanGraphValidator.js';
import { IPromptEngine } from '../services/PromptEngine.js';
import { ShellService } from '../services/ShellService.js';
import { ISkillRegistry } from '../services/SkillRegistry.js';
import { Signal } from '../workflow/Signal.js';

export class PlannerAgent {
  private shell: ShellService;

  constructor(
    private project: IProject,
    private workspace: IWorkspace,
    private skillRegistry: ISkillRegistry,
    private driverRegistry: DriverRegistry,
    private evolutionService: IEvolutionService,
    private host: IRuntimeHost,
    private bus: FileSystemBus,
    private promptEngine: IPromptEngine,
  ) {
    this.shell = new ShellService(host);
  }

  public async plan(architecture: Architecture, userRequest: string): Promise<Plan> {
    const constraints = this.project.getConstraints();
    const evolutionLog = this.evolutionService.getLogSummary();

    const params = {
      ...this.project.getConfig(),
      user_prompt: userRequest,
      agent_skills: '[]', // Placeholder
      plan_file: this.project.paths.planCurrent,
      architecture: architecture.data,
      global_constraints: constraints,
      personas_dir: this.project.paths.personas,
      active_signal: 'None',
      completed_tasks: 'None',
      evolution_log: evolutionLog,
    };

    const skill = this.skillRegistry.getSkill('planner');
    if (!skill) {
      throw new Error("Skill 'planner' not found in registry.");
    }

    const context: ISkillContext = {
      taskId: uuidv4(),
      logger: this.host,
      fileSystem: this.project.fileSystem,
      driverRegistry: this.driverRegistry,
      workspaceRoot: this.project.rootDirectory,
      params,
      userPrompt: userRequest,
      promptEngine: this.promptEngine,

      clarificationHandler: async (question: string): Promise<string> => {
        const correlationId = uuidv4();

        this.host.log('info', `Planner requesting clarification: ${question}`);

        this.bus.sendRequest({
          id: uuidv4(),
          correlationId,
          source: 'planner',
          type: 'request',
          payload: Signal.clarificationNeeded([question]),
        });

        const response = await this.bus.waitForResponse(correlationId);

        const data = response.payload as { answers: Record<string, string> };
        if (data && data.answers && data.answers[question]) {
          return data.answers[question];
        }

        return '';
      },

      commandRunner: async (cmd: string, args: string[] = []): Promise<string> => {
        const result = await this.shell.execute(cmd, args);
        return result.stdout;
      },

      validators: [PlanGraphValidator],
    };

    const result = await skill.execute(context);

    if (result.isFail()) {
      throw result.error() || new Error('Skill execution failed');
    }

    const planStr = result.unwrap();

    let plan: Plan;
    try {
      plan = Plan.fromYaml(planStr);
      await this.workspace.savePlan(plan);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      this.host.log('error', `Failed to parse plan YAML: ${error.message}\nContent: ${planStr}`);
      throw error;
    }

    const reloaded = await this.workspace.loadPlan();
    return reloaded;
  }
}
