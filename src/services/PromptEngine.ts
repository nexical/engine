import nunjucks from 'nunjucks';
import path from 'path';
import fs from 'fs-extra';
import { RuntimeHost } from '../common/interfaces/RuntimeHost.js';

export interface PromptEngineConfig {
    promptDirectory: string;
    appDirectory: string;
}

export class PromptEngine {
    private env: nunjucks.Environment;

    constructor(private config: PromptEngineConfig, private host: RuntimeHost) {

        // Define search paths for templates
        const candidatePaths = [
            this.config.promptDirectory,
            path.join(this.config.appDirectory, 'prompts'),
            path.join(this.config.appDirectory, '../prompts'),
            path.join(this.config.appDirectory, 'src/prompts')
        ];

        const searchPaths = candidatePaths.filter(p => {
            const exists = fs.existsSync(p);
            this.host.log('debug', `Prompt search path candidate: ${p} (${exists ? 'EXISTS' : 'NOT FOUND'})`);
            return exists;
        });

        if (searchPaths.length === 0) {
            this.host.log('warn', 'No valid prompt search paths found. Prompt rendering may fail.');
        }

        const loader = new nunjucks.FileSystemLoader(searchPaths, {
            noCache: true
        });

        this.env = new nunjucks.Environment(loader, {
            autoescape: false, // Prompts often contain code/markdown, autoescape might interfere
            throwOnUndefined: true,
            trimBlocks: true,
            lstripBlocks: true
        });
    }

    render(templateName: string, context: any): string {
        try {
            this.host.log('debug', `Rendering template: ${templateName}`);
            return this.env.render(templateName, context);
        } catch (e) {
            this.host.log('error', `Error rendering template ${templateName}: ${(e as Error).message}`);
            throw e;
        }
    }
}
