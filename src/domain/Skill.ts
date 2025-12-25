import { Result } from './Result.js';
import { ISkillConfig, ISkillContext, SkillSchema } from './SkillConfig.js';
import { Signal, SignalType } from '../workflow/Signal.js';

/**
 * Domain entity representing a Skill.
 * Encapsulates configuration and the 5-step execution lifecycle.
 */
export class Skill {
  private config: ISkillConfig;

  constructor(config: ISkillConfig) {
    this.config = SkillSchema.parse(config);
  }

  public get name(): string {
    return this.config.name;
  }

  public get description(): string {
    return this.config.description;
  }

  public getEnvironmentSpec() {
    return {
      dependencies: this.config.dependencies || [],
      worktree_setup: this.config.worktree_setup || [],
      hydration: this.config.hydration || [],
      sparse_checkout: this.config.sparse_checkout || [],
    };
  }

  public validate(): void {
    SkillSchema.parse(this.config);
  }

  /**
   * Executes the Standard 5-Step Skill Pipeline.
   */
  public async execute(context: ISkillContext): Promise<Result<string, Error>> {
    const { logger, clarificationHandler, validators, taskId, commandRunner } = context;
    logger?.info(`Starting execution of skill: ${this.name}`, { taskId });

    // 1. Pre-Analysis
    if (this.config.pre_analysis_commands?.length) {
      try {
        await this.runCommands(this.config.pre_analysis_commands, commandRunner);
      } catch (error) {
        return Result.fail(error instanceof Error ? error : new Error(`Pre-analysis commands failed: ${error}`));
      }
    }

    // 2. Analysis
    if (this.config.analysis_enabled && this.config.analysis) {
      let analysisResult = await this.runDriver('analysis', context);

      // Clarification Loop
      while (analysisResult.isFail()) {
        const error = analysisResult.error();
        if (error instanceof Signal && error.type === SignalType.CLARIFICATION_NEEDED) {
          const question = error.reason; // Or extract questions from metadata if bundled
          // If bundled questions, reason might be generic, questions in metadata
          const questions = (error.metadata?.questions as string[]) || [question];

          // Ask logic (supports bundling in handler if needed, but handler signature is single question
          // typically, but user said "Signal.CLARIFICATION_NEEDED accepts questions: string[]")
          // And Handler takes (question: string) => Promise.
          // We might need to adjust handler signature or loop.
          // For now, assume handler can take a JSON string or we iterate?
          // The plan says "Architect processes the list and returns a map".
          // But context.clarificationHandler signature in SkillConfig is `(question: string) => Promise<string>`.
          // I might need to update ISkillContext to `(questions: string[]) => Promise<Record<string, string>>` later.
          // For now, let's just join them or handle single.
          const answer = await clarificationHandler(questions.join('\n'));

          // Retry Analysis with answer.
          // Use params? context.userPrompt?
          // We need to inject the answer into context for the driver.
          // context.params? context.history?
          context['previous_clarification'] = answer;
          analysisResult = await this.runDriver('analysis', context);
        } else {
          // Real failure
          return analysisResult;
        }
      }
    }

    // 3. Execution
    let executionAttempts = 0;
    const maxRetries = this.config.verification_strategy?.max_retries || 3;

    while (executionAttempts <= maxRetries) {
      executionAttempts++;
      const exeResult = await this.runDriver('execution', context);
      if (exeResult.isFail()) return exeResult;

      let cycleFailed = false;
      let feedback = '';

      // 4. Post-Execution
      if (this.config.post_execution_commands?.length) {
        try {
          await this.runCommands(this.config.post_execution_commands, commandRunner);
        } catch (error) {
          cycleFailed = true;
          feedback = `Post-execution command failed: ${error}`;
        }
      }

      // 5. Verification
      if (!cycleFailed) {
        // Store result for validators to access
        context['executionResult'] = exeResult.unwrap();

        // Injectable Validators
        if (validators && validators.length > 0) {
          for (const validator of validators) {
            const vResult = await validator(context);
            if (vResult.isFail()) {
              cycleFailed = true;
              feedback = `Validator failed: ${vResult.error()?.message}`;
              break;
            }
          }
        }
      }

      if (!cycleFailed && this.config.verification) {
        const vResult = await this.runDriver('verification', context);
        if (vResult.isFail()) {
          cycleFailed = true;
          feedback = `Verification driver failed: ${vResult.error()?.message}`;
        }
      }

      if (!cycleFailed) {
        return Result.ok('Skill completed successfully');
      }

      // Feedback for next loop
      context['last_error'] = feedback;
      logger?.warn(`Skill execution cycle ${executionAttempts} failed: ${feedback}. Retrying...`);
    }

    return Result.fail(new Error(`Skill failed after ${maxRetries} attempts`));
  }

  private async runDriver(
    phase: 'analysis' | 'execution' | 'verification',
    context: ISkillContext,
  ): Promise<Result<string, Error>> {
    const driverConfig = this.config[phase];
    if (!driverConfig || !driverConfig.provider) {
      if (phase === 'execution') return Result.fail(new Error('Execution driver not configured'));
      return Result.ok('Skipped');
    }

    // Resolve driver from registry
    const driver = context.driverRegistry.getDriver(driverConfig.provider);
    if (!driver) return Result.fail(new Error(`Driver provider '${driverConfig.provider}' not found`));

    return driver.execute(driverConfig, context); // Passing ISkillConfig as per new Driver signature
  }

  private async runCommands(
    commands: string[],
    runner: (cmd: string, args?: string[]) => Promise<string>,
  ): Promise<void> {
    for (const cmd of commands) {
      // Split cmd into command and args roughly
      const parts = cmd.split(' ');
      const command = parts[0];
      const args = parts.slice(1);
      await runner(command, args);
    }
  }
}
