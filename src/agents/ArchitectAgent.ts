import { v4 as uuidv4 } from 'uuid';

import { Architecture } from '../domain/Architecture.js';
import { IProject } from '../domain/Project.js';
import { IRuntimeHost } from '../domain/RuntimeHost.js';
import { ISkillContext } from '../domain/SkillConfig.js';
import { IWorkspace } from '../domain/Workspace.js';
import { DriverRegistry } from '../drivers/DriverRegistry.js';
import { IEvolutionService } from '../services/EvolutionService.js';
import { FileSystemBus, IBusMessage } from '../services/FileSystemBus.js';
import { IPromptEngine } from '../services/PromptEngine.js';
import { ShellService } from '../services/ShellService.js';
import { ISkillRegistry } from '../services/SkillRegistry.js';
import { ISignalJSON, SignalType } from '../workflow/Signal.js';

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

  public async runOracleMode(mode: 'interactive' | 'non_interactive' = 'interactive'): Promise<void> {
    this.host.log('info', `Starting Architect Agent in Oracle Mode (${mode}) (watching inbox)...`);

    // Watch inbox with sequential handler
    this.messageBus.watchInbox(async (msg) => {
      await this.handleInboxMessage(msg, mode);
    });

    // Keep process alive
    return new Promise(() => { });
  }

  private async handleInboxMessage(message: IBusMessage, mode: 'interactive' | 'non_interactive'): Promise<void> {
    const { id, correlationId, payload, source } = message;
    this.host.log('info', `Received request from ${source} (ID: ${id})`);

    try {
      const signalData = payload as ISignalJSON;
      if (!signalData || typeof signalData !== 'object') {
        return;
      }

      if (signalData.status === SignalType.CLARIFICATION_NEEDED) {
        const questions = (signalData.metadata?.questions as string[]) || [signalData.reason];

        this.host.log('info', `Processing clarification request for ${questions.length} questions.`);

        const answers: Record<string, string> = {};

        // Load Feedback Skill
        const feedbackSkill = this.skillRegistry.getSkill('feedback');
        if (!feedbackSkill) {
          this.host.log('warn', 'Feedback skill not found. Falling back to simple passthrough.');
        }

        for (const q of questions) {
          let finalAnswer = '';

          // 1. Try to answer internally if skill exists
          if (feedbackSkill) {
            // Retrieve Context
            const wisdom = this.evolution.retrieve(q);
            const config = JSON.stringify(this.project.getConfig());

            const context: ISkillContext = {
              taskId: uuidv4(),
              logger: this.host,
              fileSystem: this.project.fileSystem,
              driverRegistry: this.driverRegistry,
              workspaceRoot: this.project.rootDirectory,
              params: {
                question: q,
                context_summary: wisdom,
                mode,
                config,
              },
              userPrompt: 'Decide if you can answer this question.',
              promptEngine: this.promptEngine,
              clarificationHandler: async () => '', // No recursion
              commandRunner: async () => '',
              validators: [],
            };

            const result = await feedbackSkill.execute(context);
            if (result.isOk()) {
              try {
                const decision = JSON.parse(result.unwrap());
                if (decision.action === 'ANSWER') {
                  finalAnswer = decision.response;
                  this.host.log('info', `Architect answered autonomously: ${q}`);
                }
              } catch (e) {
                this.host.log('error', `Failed to parse feedback skill response: ${e}`);
              }
            }
          }

          // 2. Fallback to User if no answer and interactive
          if (!finalAnswer) {
            if (mode === 'interactive') {
              const answer = await this.host.ask(q);
              finalAnswer = typeof answer === 'string' ? answer : String(answer);
            } else {
              finalAnswer = 'I cannot answer this in non-interactive mode and no autonomous answer was found.';
              this.host.log('warn', `Non-interactive mode: Failed to answer '${q}' autonomously.`);
            }
          }

          answers[q] = finalAnswer;
        }

        // Send response
        if (correlationId) {
          this.messageBus.sendResponse(correlationId, {
            answers,
          });
          this.host.log('info', `Sent response to ${source} for ${correlationId}`);
        }
      } else {
        this.host.log('warn', `Unknown message type: ${signalData.status}`);
      }
    } catch (error) {
      this.host.log(
        'error',
        `Failed to handle inbox message: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  public async design(userRequest: string): Promise<Architecture> {
    const constraints = this.project.getConstraints();
    const evolutionLog = this.evolution.retrieve(userRequest);
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
      allowed_signals: {
        COMPLETE: 'Design completed successfully.',
        FAIL: 'Validation failed or unrecoverable error.',
        CLARIFICATION_NEEDED: 'Ambiguities in the user request require clarification.',
      },
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
      throw result.error() || new Error('Skill execution failed');
    }

    const docStr = result.unwrap();

    const doc = Architecture.fromMarkdown(docStr);
    await this.workspace.saveArchitecture(doc);

    // After execution, we reload from disk to return the object.
    const reloaded = await this.workspace.getArchitecture('current');

    return reloaded;
  }
}
