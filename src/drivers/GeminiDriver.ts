import { ISkillConfig, ISkillContext } from '../domain/SkillConfig.js';
import { AICLIDriver, AISkill } from './base/AICLIDriver.js';

export class GeminiDriver extends AICLIDriver<ISkillContext> {
  name = 'gemini';
  description = 'Executes skills using the Gemini CLI.';

  async isSupported(): Promise<boolean> {
    const hasExecutable = await this.checkExecutable('gemini');
    if (!hasExecutable) return false;

    // Verify connectivity/auth by running version or simple command
    try {
      const dummySkill = { name: 'GeminiValidation', driver: 'gemini' } as unknown as any;
      // Cast to any/unknown to avoid importing ISkillConfig if not available, 
      // but ISkillConfig is imported in AICLIDriver. 
      // GeminiDriver extends AICLIDriver which uses ISkillConfig.
      // Ideally import ISkillConfig.
      // But GeminiDriver.ts imports:
      // import { ISkillConfig } from '../domain/SkillConfig.js'; (Check file content?)
      // File content shows: import { AICLIDriver, AISkillSchema } from './base/AICLIDriver.js';
      // It does NOT import ISkillConfig.
      // I should modify imports if I want to use the type, or just cast as any.

      await this.executeShell({ name: 'validation', driver: 'gemini' } as any, ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  protected getExecutable(_skill: ISkillConfig): string {
    return 'gemini';
  }

  protected getArguments(skill: ISkillConfig): string[] {
    const aiSkill = skill as AISkill;
    let args = ['prompt', '{prompt}', '--yolo'];
    if (aiSkill.args) {
      args = [...args, ...aiSkill.args];
    }
    return args;
  }
}
