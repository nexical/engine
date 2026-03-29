import yaml from 'js-yaml';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { IProject } from '../domain/Project.js';
import { IRuntimeHost } from '../domain/RuntimeHost.js';
import { Skill } from '../domain/Skill.js';
import { ISkillConfig, SkillSchema } from '../domain/SkillConfig.js';
import { DriverRegistry } from '../drivers/DriverRegistry.js'; // Assuming this location is correct based on imports

export interface ISkillRegistry {
  init(): Promise<void>;
  getSkill(name: string): Skill | undefined;
  getSkills(): Skill[];
}

export class SkillRegistry implements ISkillRegistry {
  private skills: Map<string, Skill> = new Map();

  constructor(
    private project: IProject,
    private driverRegistry: DriverRegistry, // Maybe used for validation? Or passed to context?
    // SkillRegistry doesn't strictly need DriverRegistry unless it validates skills on load.
    // SkillRunner validated on load. We can do that too.
    private host: IRuntimeHost,
  ) {}

  async init(): Promise<void> {
    await this.loadYamlSkills();
  }

  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  getSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  private async loadYamlSkills(): Promise<void> {
    const searchConfig: { path: string; name: string }[] = [
      { path: path.join(__dirname, '../skills'), name: 'Default' },
      { path: this.project.paths.skills, name: 'User' },
    ];

    for (const config of searchConfig) {
      if (!(await this.project.fileSystem.isDirectory(config.path))) {
        continue;
      }

      this.host.log('debug', `Loading ${config.name} skills from: ${config.path}`);
      const files = await this.project.fileSystem.listFiles(config.path);

      for (const filename of files) {
        if (filename.endsWith('.skill.yml') || filename.endsWith('.skill.yaml') || filename.endsWith('.yml')) {
          const filePath = path.join(config.path, filename);
          try {
            const content = await this.project.fileSystem.readFile(filePath);
            const profile = yaml.load(content);
            const parsedConfig = SkillSchema.parse(profile) as ISkillConfig;

            const skill = new Skill(parsedConfig);
            // Verify drivers exist and validate their config
            for (const phase of ['analysis', 'execution', 'verification'] as const) {
              const driverConfig = parsedConfig[phase];
              if (driverConfig?.provider) {
                const driver = this.driverRegistry.get(driverConfig.provider);
                if (driver) {
                  await driver.validateConfig(driverConfig);
                }
              }
            }

            this.skills.set(skill.name, skill);
            this.host.log('debug', `Loaded skill: ${skill.name}`);
          } catch (e: unknown) {
            this.host.log('error', `Error loading skill profile ${filename}: ${(e as Error).message}`);
          }
        }
      }
    }
  }
}
