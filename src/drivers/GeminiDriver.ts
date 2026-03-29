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
      await this.executeShell({ name: 'validation', driver: 'gemini' } as unknown as ISkillConfig, ['--version']);
      return await Promise.resolve(true);
    } catch {
      return await Promise.resolve(false);
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
