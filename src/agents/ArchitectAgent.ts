import { Architecture } from '../domain/Architecture.js';
import { IProject } from '../domain/Project.js';
import { IRuntimeHost } from '../domain/RuntimeHost.js';
import { IWorkspace } from '../domain/Workspace.js';
import { IEvolutionService } from '../services/EvolutionService.js';
import { ISkillRunner } from '../services/SkillRunner.js';

export class ArchitectAgent {
  constructor(
    private project: IProject,
    private workspace: IWorkspace,
    private skillRunner: ISkillRunner,
    private evolution: IEvolutionService,
    private host: IRuntimeHost,
  ) {}

  public async design(userRequest: string): Promise<Architecture> {
    const constraints = this.project.getConstraints();
    const evolutionLog = this.evolution.getLogSummary();
    const config = this.project.getConfig();

    const params = {
      project_name: config.project_name || 'Nexical Project',
      environment: config.environment || 'development',
      ...config,
      user_request: userRequest,
      global_constraints: constraints,
      architecture_file: this.project.paths.architectureCurrent,
      personas_dir: this.project.paths.personas,
      evolution_log: evolutionLog,
    };

    const docStr = await this.skillRunner.executeNativeSkill('architect', params, userRequest);

    const doc = Architecture.fromMarkdown(docStr);
    await this.workspace.saveArchitecture(doc);

    // After execution, we reload from disk to return the object.
    const reloaded = await this.workspace.getArchitecture('current');

    return reloaded;
  }
}
