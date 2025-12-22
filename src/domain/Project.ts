import path from 'path';
import { FileSystemService } from '../services/FileSystemService.js';
import yaml from 'js-yaml';

export interface IProject {
    readonly rootDirectory: string;
    readonly paths: ProjectPaths;
    getConstraints(): string;
    getConfig(): ProjectProfile;
}

export class Project implements IProject {
    public readonly rootDirectory: string;
    public readonly paths: ProjectPaths;
    private disk: FileSystemService;
    private profile: ProjectProfile | null = null; // Use local type

    constructor(rootDirectory: string) {
        this.rootDirectory = rootDirectory;
        this.disk = new FileSystemService();
        this.paths = new ProjectPaths(rootDirectory);
        this.ensureStructure();
    }

    public getConstraints(): string {
        if (this.disk.exists(this.paths.constraints)) {
            return this.disk.readFile(this.paths.constraints);
        }
        return "No global constraints defined.";
    }

    public getConfig(): ProjectProfile {
        if (!this.profile) {
            this.profile = this.loadProfile(this.paths.config);
        }
        return this.profile;
    }

    private loadProfile(path: string): ProjectProfile {
        if (!this.disk.exists(path)) {
            return {};
        }
        try {
            const content = this.disk.readFile(path);
            return yaml.load(content) as ProjectProfile;
        } catch (e) {
            console.error(`Failed to load project profile from ${path}:`, e);
            throw e;
        }
    }

    private ensureStructure(): void {
        this.disk.ensureDir(this.paths.ai);
        this.disk.ensureDir(this.paths.prompts);
        this.disk.ensureDir(this.paths.architecture);
        this.disk.ensureDir(this.paths.plan);
        this.disk.ensureDir(this.paths.personas);
        this.disk.ensureDir(this.paths.drivers);
        this.disk.ensureDir(this.paths.skills);
        this.disk.ensureDir(this.paths.signals);
        this.disk.ensureDir(this.paths.archive);
    }
}

class ProjectPaths {
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

export interface ProjectProfile {
    [key: string]: any;
}
