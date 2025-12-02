import fs from 'fs-extra';
import yaml from 'js-yaml';

export interface Application {
    appPath: string;
    projectPath: string;
    nexicalPath: string;
    agentsPath: string;
    historyPath: string;
    configPath: string;
    statePath: string;
    signalsPath: string;
    archivePath: string;
    logPath: string;
    agentsDefinitionPath: string;
    architecturePath: string;
    personasPath: string;
    planPath: string;
    capabilitiesPath: string;
}

export interface Project {
    project_name: string;
    production_domain?: string;
    preview_domain?: string;
}

export class ProjectUtils {
    static loadConfig(app: Application): Project {
        if (fs.existsSync(app.configPath)) {
            const content = fs.readFileSync(app.configPath, 'utf-8');
            const projectConfig = yaml.load(content) as Project;
            if (projectConfig && projectConfig.project_name) {
                return projectConfig;
            }
        }
        throw new Error(`${app.configPath} not found`);
    }
}
