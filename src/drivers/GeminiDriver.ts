import { ISkillContext, ISkillConfig } from '../domain/SkillConfig.js';
import { AICLIDriver, AISkill } from './base/AICLIDriver.js';

export class GeminiDriver extends AICLIDriver<ISkillContext> {
  name = 'gemini';
  description = 'Executes skills using the Gemini CLI.';

  async isSupported(): Promise<boolean> {
    return await this.checkExecutable('gemini');
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
