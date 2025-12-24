import { Architecture } from '../domain/Architecture.js';
import { IProject } from '../domain/Project.js';
import { IRuntimeHost } from '../domain/RuntimeHost.js';
import { IWorkspace } from '../domain/Workspace.js';
import { AISkill } from '../drivers/base/AICLIDriver.js';
import { IDriverRegistry } from '../drivers/DriverRegistry.js';
import { IEvolutionService } from '../services/EvolutionService.js';
import { IPromptEngine } from '../services/PromptEngine.js';
import { ISkillRunner } from '../services/SkillRunner.js';

export class ArchitectAgent {
  constructor(
    private project: IProject,
    private workspace: IWorkspace,
    private promptEngine: IPromptEngine,
    private driverRegistry: IDriverRegistry,
    private skillRunner: ISkillRunner,
    private evolution: IEvolutionService,
    private host: IRuntimeHost,
  ) {}

  public async design(userRequest: string): Promise<Architecture> {
    const constraints = this.project.getConstraints();
    const evolutionLog = this.evolution.getLogSummary();

    const agentSkills = JSON.stringify(this.skillRunner.getSkills(), null, 2);
    const config = this.project.getConfig();
    const fullPrompt = this.promptEngine.render(this.project.paths.architecturePrompt, {
      project_name: config.project_name || 'Nexical Project',
      environment: config.environment || 'development',
      ...config,
      user_request: userRequest,
      available_skills: agentSkills,
      global_constraints: constraints,
      architecture_file: this.project.paths.architectureCurrent,
      personas_dir: this.project.paths.personas,
      evolution_log: evolutionLog,
    });

    const agentConfig = this.project.getConfig().agents?.['architect'];
    const skillName = agentConfig?.skill || 'architect';
    const driverName = agentConfig?.driver || 'gemini';

    const architectSkill: AISkill = {
      name: skillName,
      prompt_template: '{prompt}',
    };

    const driver = this.driverRegistry.get(driverName) || this.driverRegistry.getDefault();
    if (!driver) throw new Error(`No driver available for Architect (requested: ${driverName}).`);

    const result = await driver.execute(architectSkill, {
      userPrompt: userRequest,
      params: {
        prompt: fullPrompt,
      },
    });
    this.host.log('debug', `Architect driver execution finished. Success: ${!result.isFail()}`);

    if (result.isFail()) {
      throw new Error(
        `Failed to generate architecture: ${result.error() instanceof Error ? (result.error() as Error).message : String(result.error())}`,
      );
    }

    const docStr = result.unwrap();
    const doc = Architecture.fromMarkdown(docStr);
    await this.workspace.saveArchitecture(doc);

    // After execution, we reload from disk to return the object.
    const reloaded = await this.workspace.getArchitecture('current');

    return reloaded;
  }
}
