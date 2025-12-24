import yaml from 'js-yaml';
import path from 'path';
import { z } from 'zod';

import { IFileSystem } from './IFileSystem.js';

export const AgentConfigSchema = z
  .object({
    skill: z.string().optional(),
    driver: z.string().optional(),
  })
  .passthrough();

export const ProjectConfigurationSchema = z
  .object({
    agents: z.record(z.string(), AgentConfigSchema).optional(),
    // Add other known config fields here
  })
  .passthrough();

export type ProjectProfile = z.infer<typeof ProjectConfigurationSchema>;

export interface IProject {
  readonly rootDirectory: string;
  readonly fileSystem: IFileSystem;
  readonly paths: ProjectPaths;
  getConstraints(): string;
  getConfig(): ProjectProfile;
}

export class Project implements IProject {
  public readonly rootDirectory: string;
  public readonly paths: ProjectPaths;
  public readonly fileSystem: IFileSystem;
  private profile: ProjectProfile | null = null;

  constructor(rootDirectory: string, fileSystem: IFileSystem) {
    this.rootDirectory = rootDirectory;
    this.fileSystem = fileSystem;
    this.paths = new ProjectPaths(rootDirectory);
    this.ensureStructure();
  }

  public getConstraints(): string {
    if (this.fileSystem.exists(this.paths.constraints)) {
      return this.fileSystem.readFile(this.paths.constraints);
    }
    return 'No global constraints defined.';
  }

  public getConfig(): ProjectProfile {
    if (!this.profile) {
      this.profile = this.loadProfile(this.paths.config);
    }
    return this.profile;
  }

  private loadProfile(path: string): ProjectProfile {
    if (!this.fileSystem.exists(path)) {
      return {};
    }
    try {
      const content = this.fileSystem.readFile(path);
      const raw = yaml.load(content);
      return ProjectConfigurationSchema.parse(raw);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`Failed to load project profile from ${path}:`, e);
      throw e;
    }
  }

  private ensureStructure(): void {
    this.fileSystem.ensureDir(this.paths.ai);
    this.fileSystem.ensureDir(this.paths.prompts);
    this.fileSystem.ensureDir(this.paths.architecture);
    this.fileSystem.ensureDir(this.paths.plan);
    this.fileSystem.ensureDir(this.paths.personas);
    this.fileSystem.ensureDir(this.paths.drivers);
    this.fileSystem.ensureDir(this.paths.skills);
    this.fileSystem.ensureDir(this.paths.signals);
    this.fileSystem.ensureDir(this.paths.archive);
  }
}

class ProjectPaths {
  public readonly root: string;
  public readonly ai: string;
  public readonly config: string;
  public readonly state: string;
  public readonly log: string;

  public readonly prompts: string;
  public readonly architecturePrompt: string;
  public readonly plannerPrompt: string;
  public readonly skillPrompt: string;

  public readonly constraints: string;

  public readonly architecture: string;
  public readonly architectureCurrent: string;

  public readonly plan: string;
  public readonly planCurrent: string;

  public readonly personas: string;
  public readonly drivers: string;
  public readonly skills: string;
  public readonly signals: string;
  public readonly archive: string;

  constructor(root: string) {
    this.root = root;
    this.ai = path.join(root, '.ai');
    this.config = path.join(this.ai, 'config.yml');
    this.state = path.join(this.ai, 'state.yml');
    this.log = path.join(this.ai, 'log.yml');

    this.prompts = path.join(this.ai, 'prompts');
    this.architecturePrompt = 'architect.md';
    this.plannerPrompt = 'planner.md';
    this.skillPrompt = 'skill.md';

    this.constraints = path.join(root, 'AGENTS.md');

    this.architecture = path.join(this.ai, 'architecture');
    this.architectureCurrent = path.join(this.architecture, 'current.md');

    this.plan = path.join(this.ai, 'plan');
    this.planCurrent = path.join(this.plan, 'current.yml');

    this.personas = path.join(this.ai, 'personas');
    this.drivers = path.join(this.ai, 'drivers');
    this.skills = path.join(this.ai, 'skills');
    this.signals = path.join(this.ai, 'signals');
    this.archive = path.join(this.ai, 'archive');
  }
}

// End of file
