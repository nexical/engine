import yaml from 'js-yaml';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { ISkill, SkillSchema } from '../domain/Driver.js';
import { IProject } from '../domain/Project.js';
import { IRuntimeHost } from '../domain/RuntimeHost.js';
import { Task } from '../domain/Task.js';
import { DriverRegistry } from '../drivers/DriverRegistry.js';
import { PromptEngine } from './PromptEngine.js';

export interface ISkillRunner {
  init(): Promise<void>;
  validateAvailableSkills(): Promise<void>;
  getSkills(): ISkill[];
  runSkill(task: Task, userPrompt: string, cwd?: string): Promise<void>;
  executeNativeSkill(skillName: string, params: Record<string, unknown>, userPrompt: string): Promise<string>;
}

export class SkillRunner implements ISkillRunner {
  private skills: Record<string, ISkill> = {};

  constructor(
    private project: IProject,
    private driverRegistry: DriverRegistry,
    private promptEngine: PromptEngine,
    private host: IRuntimeHost,
  ) {}

  init(): Promise<void> {
    this.loadYamlSkills();
    return Promise.resolve();
  }

  private loadYamlSkills(): void {
    const searchConfig: { path: string; name: string }[] = [
      { path: path.join(__dirname, '../skills'), name: 'Default' },
      { path: this.project.paths.skills, name: 'User' },
    ];

    for (const config of searchConfig) {
      if (!this.project.fileSystem.isDirectory(config.path)) {
        continue;
      }

      this.host.log('debug', `Loading ${config.name} skills from: ${config.path}`);
      const files = this.project.fileSystem.listFiles(config.path);

      for (const filename of files) {
        if (filename.endsWith('.skill.yml') || filename.endsWith('.skill.yaml') || filename.endsWith('.yml')) {
          const filePath = path.join(config.path, filename);
          try {
            const content = this.project.fileSystem.readFile(filePath);
            const profile = yaml.load(content);
            const parsed = SkillSchema.parse(profile);
            // User skills overwrite default skills
            this.skills[parsed.name] = parsed as ISkill;
            this.host.log('debug', `Loaded skill: ${parsed.name}`);
          } catch (e: unknown) {
            this.host.log('error', `Error loading skill profile ${filename}: ${(e as Error).message}`);
          }
        }
      }
    }
  }

  async validateAvailableSkills(): Promise<void> {
    const errors: string[] = [];

    for (const [name, skill] of Object.entries(this.skills)) {
      try {
        let driver;
        if (skill.provider) {
          driver = this.driverRegistry.get(skill.provider);
          if (!driver) {
            errors.push(`Skill '${name}' requires missing driver '${String(skill.provider)}'.`);
            continue;
          }
        } else {
          driver = this.driverRegistry.getDefault();
          if (!driver) {
            errors.push(`Skill '${name}' needs a default driver but none is available.`);
            continue;
          }
        }

        if (!(await driver.isSupported())) {
          errors.push(
            `Skill '${name}' uses driver '${driver.name}' which is not supported in the current environment.`,
          );
          continue;
        }

        const valid = await driver.validateSkill(skill);
        if (!valid) {
          errors.push(
            `Skill '${name}' failed validation for driver '${driver.name}': Driver reported incompatibility.`,
          );
        }
      } catch (_e) {
        this.host.log('error', `Error loading skill profile ${name}: ${(_e as Error).message}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Skill validation failed:\n${errors.join('\n')}`);
    }

    this.host.log('debug', `Validated ${Object.keys(this.skills).length} skills successfully.`);
  }

  getSkills(): ISkill[] {
    return Object.values(this.skills);
  }

  async runSkill(task: Task, userPrompt: string, cwd?: string): Promise<void> {
    this.host.log('info', task.message);

    const profile = this.skills[task.skill];
    if (!profile) {
      throw new Error(`Skill '${task.skill}' not found.`);
    }

    await this.executeSkill(task, profile, userPrompt, cwd);
  }

  async executeNativeSkill(skillName: string, params: Record<string, unknown>, userPrompt: string): Promise<string> {
    const profile = this.skills[skillName];
    if (!profile) {
      throw new Error(`Skill '${skillName}' not found.`);
    }

    let driver;
    if (profile.provider) {
      driver = this.driverRegistry.get(String(profile.provider));
      if (!driver) {
        throw new Error(`Driver '${String(profile.provider)}' not found.`);
      }
    } else {
      driver = this.driverRegistry.getDefault();
    }

    if (!driver) {
      throw new Error('No driver found for execution.');
    }

    try {
      const result = await driver.execute(profile, {
        userPrompt: userPrompt,
        params: params,
        promptEngine: this.promptEngine,
      });

      if (result.isFail()) {
        throw result.error() || new Error('Unknown error during native skill execution');
      }
      return result.unwrap();
    } catch (err) {
      this.host.log('error', `An error occurred while executing the native skill ${skillName}: ${String(err)}`);
      throw err;
    }
  }

  private async executeSkill(task: Task, profile: ISkill, userPrompt: string, cwd?: string): Promise<void> {
    // Determine which driver to use.
    let driver;
    if (profile.provider) {
      this.host.log('debug', `[DEBUG] Skill ${profile.name} provider: ${profile.provider}`);
      driver = this.driverRegistry.get(String(profile.provider));
      if (!driver) {
        throw new Error(`Driver '${String(profile.provider)}' not found.`);
      }
    } else {
      this.host.log('debug', `[DEBUG] Skill ${profile.name} has no provider, using default`);
      driver = this.driverRegistry.getDefault();
    }

    if (driver) {
      this.host.log('debug', `[DEBUG] Resolved driver: ${driver.name}`);
    }

    if (!driver) {
      throw new Error('No driver found for execution.');
    }

    let userPromptWithPersona = userPrompt;
    let personaContext = '';

    if (task.persona) {
      // Updated to use project paths
      const personaFile = path.join(this.project.paths.personas, `${task.persona}.md`);
      if (this.project.fileSystem.exists(personaFile)) {
        personaContext = this.project.fileSystem.readFile(personaFile);
      } else {
        this.host.log('warn', `Persona file not found: ${personaFile}`);
      }
    }

    userPromptWithPersona = this.promptEngine.render(this.project.paths.skillPrompt, {
      user_prompt: userPrompt,
      persona_context: personaContext,
    });

    try {
      const result = await driver.execute(profile, {
        userPrompt: userPromptWithPersona,
        taskId: task.id,
        taskPrompt: task.description,
        params: task.params,
        cwd: cwd,
        promptEngine: this.promptEngine,
      });

      if (result.isFail()) {
        throw result.error() || new Error('Unknown error during skill execution');
      }
    } catch (err) {
      this.host.log('error', `An error occurred while executing the skill ${task.skill}: ${String(err)}`);
      throw err;
    }
  }
}
