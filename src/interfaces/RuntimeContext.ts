import { RuntimeHost } from './RuntimeHost.js';
import { FileSystemService } from '../services/FileSystemService.js';
import { Application } from '../models/Application.js';
import { DriverRegistry } from '../drivers/Registry.js';
import { PromptEngine } from '../services/PromptEngine.js';
import { SkillRunner } from '../services/SkillRunner.js';

export interface RuntimeContext {
    host: RuntimeHost;
    disk: FileSystemService;
    config: Application;
    driverRegistry: DriverRegistry;
    promptEngine: PromptEngine;
    skillRunner: SkillRunner;
    interactive: boolean;
}
