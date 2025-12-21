import { FileSystemService } from '../services/FileSystemService.js';
import { fileURLToPath } from 'url';
import path from 'path';

export class Application {
    private disk: FileSystemService;

    public rootDirectory: string;
    public appDirectory: string;
    public aiDirectory: string;

    public configPath: string;
    public statePath: string;
    public logPath: string;

    public promptDirectory: string;
    public architecturePromptFile: string;
    public plannerPromptFile: string;
    public skillPromptFile: string;

    public constraintsPath: string;
    public architectureDirectory: string;
    public architecturePath: string;
    public planDirectory: string;
    public planPath: string;

    public personasDirectory: string;
    public driversDirectory: string;
    public skillsDirectory: string;
    public skillsPath: string;

    public signalsDirectory: string;
    public archiveDirectory: string;

    constructor(rootDirectory: string, disk: FileSystemService) {
        this.disk = disk;

        this.rootDirectory = rootDirectory;
        this.appDirectory = path.dirname(fileURLToPath(import.meta.url));
        this.aiDirectory = path.join(this.rootDirectory, '.ai');

        this.configPath = path.join(this.aiDirectory, 'config.yml');
        this.statePath = path.join(this.aiDirectory, 'state.yml');
        this.logPath = path.join(this.aiDirectory, 'log.yml');

        this.promptDirectory = path.join(this.aiDirectory, 'prompts');
        this.architecturePromptFile = 'architecture.md';
        this.plannerPromptFile = 'planner.md';
        this.skillPromptFile = 'skill.md';

        this.constraintsPath = path.join(this.rootDirectory, 'AGENTS.md');
        this.architectureDirectory = path.join(this.aiDirectory, 'architecture');
        this.architecturePath = path.join(this.architectureDirectory, 'current.md');
        this.planDirectory = path.join(this.aiDirectory, 'plan');
        this.planPath = path.join(this.planDirectory, 'current.yml');

        this.personasDirectory = path.join(this.aiDirectory, 'personas');
        this.driversDirectory = path.join(this.aiDirectory, 'drivers');
        this.skillsDirectory = path.join(this.aiDirectory, 'skills');
        this.skillsPath = path.join(this.skillsDirectory, 'skills.yml');

        this.signalsDirectory = path.join(this.aiDirectory, 'signals');
        this.archiveDirectory = path.join(this.aiDirectory, 'archive');

        this.ensureDirectories();
    }

    public ensureDirectories(): void {
        this.disk.ensureDir(this.aiDirectory);
        this.disk.ensureDir(this.promptDirectory);
        this.disk.ensureDir(this.architectureDirectory);
        this.disk.ensureDir(this.planDirectory);
        this.disk.ensureDir(this.personasDirectory);
        this.disk.ensureDir(this.driversDirectory);
        this.disk.ensureDir(this.skillsDirectory);
        this.disk.ensureDir(this.signalsDirectory);
        this.disk.ensureDir(this.archiveDirectory);
    }
}
