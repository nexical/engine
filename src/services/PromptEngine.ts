import nunjucks from 'nunjucks';
import path from 'path';
import debug from 'debug';
import type { Orchestrator } from '../orchestrator.js';

const log = debug('prompt-engine');

export class PromptEngine {
    private env: nunjucks.Environment;

    constructor(private core: Orchestrator) {
        // Define search paths for templates
        // Priority:
        // 1. Project overrides: <projectPath>/.nexical/prompts
        // 2. Default prompts: <appPath>/prompts
        const searchPaths = [
            path.join(this.core.config.nexicalPath, 'prompts'),
            path.join(this.core.config.appPath, 'prompts')
        ];

        log(`Initializing PromptEngine with search paths: ${searchPaths.join(', ')}`);

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
            log(`Rendering template: ${templateName}`);
            return this.env.render(templateName, context);
        } catch (e) {
            console.error(`Error rendering template ${templateName}:`, e);
            throw e;
        }
    }
}
