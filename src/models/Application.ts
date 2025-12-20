import fs from 'fs-extra';
import yaml from 'js-yaml';

export interface Application {
    workingDirectory: string;
    appPath: string;
    nexicalPath: string;
    skillsDir: string;
    historyPath: string;
    configPath: string;
    statePath: string;
    signalsPath: string;
    archivePath: string;
    logPath: string;
    skillsDefinitionPath: string;
    architecturePath: string;
    personasPath: string;
    planPath: string;
    skillsPath: string;
    driversDir: string;
}

export interface JobContext {
    jobId: number;
    projectId: number;
    teamId: number;
    mode: 'managed' | 'self_hosted';
}

export interface RuntimeConfig {
    workingDirectory: string;
    jobContext?: JobContext;
    env?: Record<string, string>;
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
