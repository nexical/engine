import { IDriverContext } from '../domain/Driver.js';
import { AICLIDriver, AISkill } from './base/AICLIDriver.js';

export class GeminiDriver extends AICLIDriver<IDriverContext> {
  name = 'gemini';
  description = 'Executes skills using the Gemini CLI.';

  async isSupported(): Promise<boolean> {
    return await this.checkExecutable('gemini');
  }

  protected getExecutable(_skill: AISkill): string {
    return 'gemini';
  }

  protected getArguments(skill: AISkill): string[] {
    let args = ['prompt', '{prompt}', '--yolo'];
    if (skill.args) {
      args = [...args, ...skill.args];
    }
    return args;
  }
}
