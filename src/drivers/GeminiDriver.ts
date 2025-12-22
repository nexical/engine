import { AICLIDriver, AISkill } from './base/AICLIDriver.js';

export class GeminiDriver extends AICLIDriver<any> {
    name = 'gemini';
    description = 'Executes skills using the Gemini CLI.';

    async isSupported(): Promise<boolean> {
        return this.checkExecutable('gemini');
    }

    protected getExecutable(skill: AISkill): string {
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
