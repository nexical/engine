import yaml from 'js-yaml';
import path from 'path';
import { z } from 'zod';

import { IFileSystem } from './IFileSystem.js';
import { IRuntimeHost } from './RuntimeHost.js';

export const AgentConfigSchema = z
  .object({
    skill: z.string().optional(),
    driver: z.string().optional(),
  })
  .passthrough();

export const ProjectConfigurationSchema = z
  .object({
    agents: z.record(z.string(), AgentConfigSchema).optional(),
    git: z
      .object({
        submodules: z.boolean().optional(),
      })
      .optional(),
    // Add other known config fields here
    max_worktrees: z.number().optional().default(5),
  })
  .passthrough();

export type ProjectProfile = z.infer<typeof ProjectConfigurationSchema>;

export interface IProject {
  readonly rootDirectory: string;
  readonly fileSystem: IFileSystem;
  readonly paths: ProjectPaths;
  init(): Promise<void>;
  getConstraints(): Promise<string>;
  getConfig(): Promise<ProjectProfile>;
}

export class Project implements IProject {
  public readonly rootDirectory: string;
  public readonly paths: ProjectPaths;
  public readonly fileSystem: IFileSystem;
  private profile: ProjectProfile | null = null;

  constructor(
    rootDirectory: string,
    fileSystem: IFileSystem,
    private host?: IRuntimeHost,
  ) {
    this.rootDirectory = rootDirectory;
    this.fileSystem = fileSystem;
    this.paths = new ProjectPaths(rootDirectory);
  }

  public async init(): Promise<void> {
    await this.ensureStructure();
  }

  public async getConstraints(): Promise<string> {
    if (await this.fileSystem.exists(this.paths.constraints)) {
      return await this.fileSystem.readFile(this.paths.constraints);
    }
    return 'No global constraints defined.';
  }

  public async getConfig(): Promise<ProjectProfile> {
    if (!this.profile) {
      this.profile = await this.loadProfile(this.paths.config);
    }
    return this.profile;
  }

  private async loadProfile(path: string): Promise<ProjectProfile> {
    if (!(await this.fileSystem.exists(path))) {
      return ProjectConfigurationSchema.parse({});
    }
    try {
      const content = await this.fileSystem.readFile(path);
      const raw = yaml.load(content);
      return ProjectConfigurationSchema.parse(raw);
    } catch (e) {
      if (this.host) {
        this.host.log('error', `Failed to load project profile from ${path}: ${(e as Error).message}`);
      }
      throw e;
    }
  }

  private async ensureStructure(): Promise<void> {
    await this.fileSystem.ensureDir(this.paths.ai);
    await this.fileSystem.ensureDir(this.paths.prompts);
    await this.fileSystem.ensureDir(this.paths.architecture);
    await this.fileSystem.ensureDir(this.paths.plan);
    await this.fileSystem.ensureDir(this.paths.evolution);
    await this.fileSystem.ensureDir(this.paths.evolutionTopics);
    await this.fileSystem.ensureDir(this.paths.personas);
    await this.fileSystem.ensureDir(this.paths.drivers);
    await this.fileSystem.ensureDir(this.paths.skills);
    await this.fileSystem.ensureDir(this.paths.signals);
    await this.fileSystem.ensureDir(this.paths.comms);
    await this.fileSystem.ensureDir(this.paths.inbox);
    await this.fileSystem.ensureDir(this.paths.outbox);
    await this.fileSystem.ensureDir(this.paths.archive);
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

  public readonly evolution: string;
  public readonly evolutionIndex: string;
  public readonly evolutionTopics: string;

  public readonly constraints: string;

  public readonly architecture: string;
  public readonly architectureCurrent: string;

  public readonly plan: string;
  public readonly planCurrent: string;

  public readonly personas: string;
  public readonly drivers: string;
  public readonly skills: string;
  public readonly signals: string;
  public readonly comms: string;
  public readonly inbox: string;
  public readonly outbox: string;
  public readonly archive: string;

  constructor(root: string) {
    this.root = root;
    this.ai = path.join(root, '.ai');
    this.config = path.join(this.ai, 'config.yml');
    this.state = path.join(this.ai, 'state.yml');
    this.log = path.join(this.ai, 'log.jsonl');

    this.prompts = path.join(this.ai, 'prompts');
    this.architecturePrompt = 'architect.md';
    this.plannerPrompt = 'planner.md';
    this.skillPrompt = 'skill.md';

    this.evolution = path.join(this.ai, 'evolution');
    this.evolutionIndex = path.join(this.evolution, 'index.json');
    this.evolutionTopics = path.join(this.evolution, 'topics');

    this.constraints = path.join(root, 'AGENTS.md');

    this.architecture = path.join(this.ai, 'architecture');
    this.architectureCurrent = path.join(this.architecture, 'current.md');

    this.plan = path.join(this.ai, 'plan');
    this.planCurrent = path.join(this.plan, 'current.yml');

    this.personas = path.join(this.ai, 'personas');
    this.drivers = path.join(this.ai, 'drivers');
    this.skills = path.join(this.ai, 'skills');
    this.signals = path.join(this.ai, 'signals');
    this.comms = path.join(this.ai, 'comms');
    this.inbox = path.join(this.comms, 'inbox');
    this.outbox = path.join(this.comms, 'outbox');
    this.archive = path.join(this.ai, 'archive');
  }
}

// End of file
