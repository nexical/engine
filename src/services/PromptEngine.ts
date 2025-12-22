import nunjucks from 'nunjucks';
import path from 'path';
import { RuntimeHost } from '../interfaces/RuntimeHost.js';

export interface PromptEngineConfig {
    promptDirectory: string;
    appDirectory: string;
}

export class PromptEngine {
    private env: nunjucks.Environment;

    constructor(private config: PromptEngineConfig, private host: RuntimeHost) {
        // Define search paths for templates
        // Priority:
        // 1. Project overrides: <projectPath>/.ai/prompts (Use config.promptDirectory)
        // 2. Default prompts: <appPath>/../prompts (Relative to models dir - legacy, now appDirectory)
        const searchPaths = [
            this.config.promptDirectory,
            path.join(this.config.appDirectory, '../prompts')
        ];

        this.host.log('debug', `Initializing PromptEngine with search paths: ${searchPaths.join(', ')}`);

        const loader = new nunjucks.FileSystemLoader(searchPaths, {
            noCache: true // Useful for development/overrides
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
