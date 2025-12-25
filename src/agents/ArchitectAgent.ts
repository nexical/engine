import { v4 as uuidv4 } from 'uuid';

import { Architecture } from '../domain/Architecture.js';
import { IProject } from '../domain/Project.js';
import { IRuntimeHost } from '../domain/RuntimeHost.js';
import { ISkillContext } from '../domain/SkillConfig.js';
import { IWorkspace } from '../domain/Workspace.js';
import { DriverRegistry } from '../drivers/DriverRegistry.js';
import { IEvolutionService } from '../services/EvolutionService.js';
import { ShellService } from '../services/ShellService.js';
import { ISkillRegistry } from '../services/SkillRegistry.js';

import { FileSystemBus, IBusMessage } from '../services/FileSystemBus.js';
import { SignalType } from '../workflow/Signal.js';
import { IPromptEngine } from '../services/PromptEngine.js';

export class ArchitectAgent {
  private shell: ShellService;

  constructor(
    private project: IProject,
    private workspace: IWorkspace,
    private skillRegistry: ISkillRegistry,
    private driverRegistry: DriverRegistry,
    private evolution: IEvolutionService,
    private host: IRuntimeHost,
    private messageBus: FileSystemBus,
    private promptEngine: IPromptEngine,
  ) {
    this.shell = new ShellService(host);
  }

  public async runOracleMode(): Promise<void> {
    this.host.log('info', 'Starting Architect Agent in Oracle Mode (watching inbox)...');

    // Watch inbox with sequential handler
    this.messageBus.watchInbox(async (msg) => {
      await this.handleInboxMessage(msg);
    });

    // Keep process alive
    return new Promise(() => { });
  }

  private async handleInboxMessage(message: IBusMessage): Promise<void> {
    const { id, correlationId, payload, source } = message;
    this.host.log('info', `Received request from ${source} (ID: ${id})`);

    try {
      const signalData = payload as any;

      if (signalData.type === SignalType.CLARIFICATION_NEEDED) {
        const questions = (signalData.metadata?.questions as string[]) || [signalData.reason];
        // const context = signalData.metadata || {};

        this.host.log('info', `Processing clarification request for ${questions.length} questions.`);

        const answers: Record<string, string> = {};

        for (const q of questions) {
          const answer = await this.host.ask(q);
          const ansStr = typeof answer === 'string' ? answer : String(answer);
          answers[q] = ansStr;
        }

        // Send response
        if (correlationId) {
          await this.messageBus.sendResponse(correlationId, {
            answers,
          });
          this.host.log('info', `Sent response to ${source} for ${correlationId}`);
        }
      } else {
        this.host.log('warn', `Unknown message type: ${signalData.type}`);
      }
    } catch (error) {
      this.host.log('error', `Failed to handle inbox message: ${error}`);
    }
  }

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

    const skill = this.skillRegistry.getSkill('architect');
    if (!skill) {
      throw new Error("Skill 'architect' not found in registry.");
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
        const answer = await this.host.ask(question);
        return typeof answer === 'string' ? answer : String(answer);
      },

      commandRunner: async (cmd: string, args: string[] = []): Promise<string> => {
        const result = await this.shell.execute(cmd, args);
        return result.stdout;
      },

      validators: [],
    };

    const result = await skill.execute(context);

    if (result.isFail()) {
      throw result.error();
    }

    const docStr = result.unwrap();

    const doc = Architecture.fromMarkdown(docStr);
    await this.workspace.saveArchitecture(doc);

    // After execution, we reload from disk to return the object.
    const reloaded = await this.workspace.getArchitecture('current');

    return reloaded;
  }
}
