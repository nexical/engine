import { PromptEngine, PromptEngineConfig } from '../services/PromptEngine.js';
import { DriverRegistry } from '../drivers/Registry.js';
import { RuntimeHost } from '../domain/RuntimeHost.js';
import { Project } from '../domain/Project.js';
import { Skill } from '../domain/Driver.js';
import { Driver } from '../domain/Driver.js';
import { FileSystemService } from '../services/FileSystemService.js';
import { SkillRunner } from '../services/SkillRunner.js'; // Statically import SkillRunner
import { EvolutionService } from '../services/EvolutionService.js'; // Import EvolutionService
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export class Brain {
    private promptEngine: PromptEngine;
    private driverRegistry: DriverRegistry;
    private skillRunner: SkillRunner; // Type as SkillRunner
    private contextAdapter: any; // Legacy compatibility
    private evolution: EvolutionService; // Add evolution service property

    constructor(
        private project: Project,
        private host: RuntimeHost
    ) {
        // 1. Initialize PromptEngine
        const promptConfig: PromptEngineConfig = {
            promptDirectory: project.paths.prompts,
            appDirectory: project.rootDirectory
        };
        this.promptEngine = new PromptEngine(promptConfig, host);

        // 2. Initialize DriverRegistry
        const driverConfig = {
            ...project.paths,
            rootDirectory: project.rootDirectory
        };
        this.driverRegistry = new DriverRegistry(host, driverConfig);

        // 3. Initialize SkillRunner
        this.skillRunner = new SkillRunner(project, this.driverRegistry, this.promptEngine, host);

        // 4. Initialize EvolutionService
        this.evolution = new EvolutionService(project);

        // 5. Create Legacy Context Adapter (if needed by getContext())
        this.contextAdapter = {
            host: host,
            config: driverConfig,
            promptEngine: this.promptEngine,
            driverRegistry: this.driverRegistry,
            skillRunner: this.skillRunner,
            disk: new FileSystemService()
        };
    }



    public getContext(): any {
        return this.contextAdapter;
    }

    public async init(): Promise<void> {
        // Load drivers
        await this.driverRegistry.load(this.project.paths.drivers);

        // Validate skills
        await this.skillRunner.validateAvailableSkills();
    }

    public getPromptEngine(): PromptEngine {
        return this.promptEngine;
    }

    public getSkillRunner(): SkillRunner { // Return SkillRunner
        return this.skillRunner;
    }

    public getEvolution(): EvolutionService {
        return this.evolution;
    }

    public getDriver(name: string): Driver | undefined {
        return this.driverRegistry.get(name);
    }

    public getDefaultDriver(): Driver | undefined {
        return this.driverRegistry.getDefault();
    }
}
