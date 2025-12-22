import { RuntimeHost } from './RuntimeHost.js';
import { FileSystemService } from '../services/FileSystemService.js';
import { Project } from './Project.js';
import { DriverRegistry } from '../drivers/Registry.js';
import { PromptEngine } from '../services/PromptEngine.js';
import { SkillRunner } from '../services/SkillRunner.js';

export interface RuntimeContext {
    host: RuntimeHost;
    disk: FileSystemService;
    project: Project;
    driverRegistry: DriverRegistry;
    promptEngine: PromptEngine;
    skillRunner: SkillRunner;
    interactive: boolean;
}
