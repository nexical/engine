import { v4 as uuidv4 } from 'uuid';

import { IProject } from '../domain/Project.js';
import { IRuntimeHost } from '../domain/RuntimeHost.js';
import { ISkillContext } from '../domain/SkillConfig.js';
import { DriverRegistry } from '../drivers/DriverRegistry.js';
import { IPromptEngine } from '../services/PromptEngine.js';
import { ShellService } from '../services/ShellService.js';
import { ISkillRegistry } from '../services/SkillRegistry.js';

export class AnalystAgent {
  private shell: ShellService;

  constructor(
    private project: IProject,
    private skillRegistry: ISkillRegistry,
    private driverRegistry: DriverRegistry,
    private host: IRuntimeHost,
    private promptEngine: IPromptEngine,
  ) {
    this.shell = new ShellService(host);
  }

  public async analyze(): Promise<void> {
    const logPath = this.project.paths.log;

    // 1. Check if there is anything to analyze
    if (!(await this.project.fileSystem.exists(logPath))) {
      this.host.log('info', 'Analyst: No evolution log found to analyze.');
      return;
    }

    const logContent = await this.project.fileSystem.readFile(logPath);
    if (!logContent || logContent.trim().length === 0) {
      this.host.log('info', 'Analyst: Evolution log is empty.');
      return;
    }

    this.host.log('info', 'Analyst: Starting evolution analysis...');

    // 2. Prepare Context
    const params = {
      log_content: logContent,
      evolution_dir: this.project.paths.evolution,
      index_file: this.project.paths.evolutionIndex,
      topics_dir: this.project.paths.evolutionTopics,
    };

    // 3. Get Skill
    const skill = this.skillRegistry.getSkill('analyst');
    if (!skill) {
      throw new Error("Skill 'analyst' not found in registry.");
    }

    // 4. Execute Skill
    const context: ISkillContext = {
      taskId: uuidv4(),
      logger: this.host,
      fileSystem: this.project.fileSystem,
      driverRegistry: this.driverRegistry,
      workspaceRoot: this.project.rootDirectory,
      params,
      userPrompt: 'Analyze the provided evolution log and update the wisdom topics.',
      promptEngine: this.promptEngine,

      // Analyst doesn't need clarification or complex command running usually, but we provide basics
      clarificationHandler: async (q) => {
        this.host.log('warn', `Analyst asked for clarification: ${q}. Returning empty.`);
        return await Promise.resolve('');
      },
      commandRunner: async (cmd, args) => {
        const result = await this.shell.execute(cmd, args || []);
        return result.stdout;
      },
      validators: [],
    };

    try {
      const result = await skill.execute(context);

      if (result.isFail()) {
        this.host.log('error', `Analyst failed: ${result.error()?.message}`);
      } else {
        this.host.log('info', `Analyst completed: ${result.unwrap()}`);

        // 5. Reset Log (Only on success)
        await this.project.fileSystem.deleteFile(logPath);
        this.host.log('info', 'Analyst: Evolution log reset.');
      }
    } catch (e) {
      this.host.log('error', `Analyst execution exception: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
