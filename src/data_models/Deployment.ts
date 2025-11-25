import fs from 'fs-extra';
import yaml from 'js-yaml';
import { Application } from './Application.js';

export interface Deployment {
    project_name: string;
    production_domain?: string;
    preview_domain?: string;
}

export class DeployUtils {
    static loadConfig(config: Application): Deployment {
        if (fs.existsSync(config.deployConfigPath)) {
            const content = fs.readFileSync(config.deployConfigPath, 'utf-8');
            const deployConfig = yaml.load(content) as Deployment;
            if (deployConfig && deployConfig.project_name) {
                return deployConfig;
            }
        }
        throw new Error(`${config.deployConfigPath} not found`);
    }
}
