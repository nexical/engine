import path from 'path';
import { z, ZodSafeParseResult } from 'zod';

import { DriverConfig, ISkillConfig, ISkillContext } from '../../domain/SkillConfig.js';
import { CLIDriver, CLISkillSchema } from './CLIDriver.js';

export const AISkillSchema = CLISkillSchema.extend({
  prompt_template: z.string(),
}).passthrough();

export type AISkill = z.infer<typeof AISkillSchema>;

export abstract class AICLIDriver<TContext extends ISkillContext = ISkillContext> extends CLIDriver<TContext> {
  async isSupported(): Promise<boolean> {
    return await Promise.resolve(false);
  }

  protected parseSchema(skill: ISkillConfig): ZodSafeParseResult<AISkill> {
    return AISkillSchema.safeParse(skill);
  }

  protected abstract getExecutable(skill: ISkillConfig): string;
  protected abstract getArguments(skill: ISkillConfig): string[];

  async run(config: DriverConfig, context?: TContext): Promise<string> {
    const aiSkill = config as unknown as AISkill;
    let promptTemplate = aiSkill.prompt_template || '';
    const params = (context?.params as Record<string, unknown>) || {};
    const promptEngine = context?.promptEngine;

    if (!promptEngine) {
      throw new Error('PromptEngine is required in DriverContext for AISkill execution.');
    }

    const taskId = context?.taskId || 'unknown';
    const signalsDir = context?.workspaceRoot
      ? path.join(context.workspaceRoot, '.ai/signals')
      : path.join(this.systemConfig.rootDirectory as string, '.ai/signals');

    // Generate unique signal path: sig_<taskId>_<timestamp>.json
    const timestamp = Date.now();
    const signalFilename = `sig_${taskId}_${timestamp}.json`;
    const signalFilePath = path.join(signalsDir, signalFilename);

    let footer = '';
    const fs = context?.fileSystem;

    // Default signals with descriptions
    const defaultSignals: Record<string, string> = {
      COMPLETE: 'Task completed successfully.',
      FAIL: 'Task failed and cannot be recovered.',
      CLARIFICATION_NEEDED: 'User input is required to proceed.',
      REPLAN: 'The current plan is invalid and needs to be regenerated.',
      REARCHITECT: 'Fundamental architectural flaws detected requiring redesign.',
    };

    let allowedSignals = defaultSignals;

    // Check if params has allowed_signals override
    if (params.allowed_signals) {
      if (typeof params.allowed_signals === 'string') {
        try {
          // Attempt to parse if it's a JSON string
          // This allows YAML definition to pass a map
          allowedSignals = JSON.parse(params.allowed_signals) as Record<string, string>;
        } catch {
          // Fallback to single item or simple string - but user asked for map.
          // Let's assume if it's a single key?
          // Or we just warn and use defaults?
          // Let's treat it as a raw string to be safe if legacy.
          // BUT we need to format it as a map.
          // Let's just log warning and use default if parsing fails,
          // OR if it's a simple string, wrap it.
          this.host.log('warn', `allowed_signals param is not a valid JSON map. Using defaults.`);
          allowedSignals = defaultSignals;
        }
      } else if (typeof params.allowed_signals === 'object') {
        allowedSignals = params.allowed_signals as Record<string, string>;
      }
    }

    // Format signals for template
    const signalMapString = Object.entries(allowedSignals)
      .map(([signal, desc]) => `- "${signal}": ${desc}`)
      .join('\n');

    if (fs) {
      const projectFooterPath = path.join(
        context.workspaceRoot || (this.systemConfig.rootDirectory as string),
        '.ai/templates/cli_footer.md',
      );
      try {
        footer = await fs.readFile(projectFooterPath);
      } catch (e) {
        // Fallback logic handled by promptEngine if empty?
        // Or re-implement fallback here as safety.
        this.host.log('warn', `Could not load cli_footer.md: ${(e as Error).message}. Using fallback.`);
        footer = `
---
# SYSTEM INSTRUCTION: MANDATORY
Upon finishing the task, you MUST write a JSON file to the exact path below.
Do not output this JSON to the screen. Write it to the file.

You have the following signals available to you:
{{ allowed_signals }}

Target File: {{ signal_file_path }}

JSON Content Structure:
{
  "status": "SIGNAL_NAME",
  "reason": "Short explanation of result",
  "artifacts": ["path/to/file1", "path/to/file2"]
}
`;
      }
    }

    promptTemplate = `${promptTemplate}\n${footer}`;

    const formatArgs: Record<string, unknown> = {
      ...params,
      user_request: context?.userPrompt || '',
      task_id: taskId,
      task_prompt: context?.taskPrompt,
      signal_file_path: signalFilePath,
      allowed_signals: signalMapString,
    };

    // 1. Render the main prompt (including footer with variables)
    formatArgs['prompt'] = promptEngine.renderString(promptTemplate, formatArgs);

    const argsTemplate = this.getArguments(aiSkill);
    const finalArgs = argsTemplate.map((arg) => promptEngine.renderString(arg, formatArgs));

    return await this.executeShell(aiSkill, finalArgs, context);
  }
}
