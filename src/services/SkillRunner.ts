import path from 'path';
import yaml from 'js-yaml';
import { Task } from '../domain/Task.js';
import { Skill } from '../domain/Driver.js';
import { Project } from '../domain/Project.js';
import { DriverRegistry } from './drivers/Registry.js';
import { RuntimeHost } from '../domain/RuntimeHost.js';
import { PromptEngine } from './PromptEngine.js';
import { FileSystemService } from './FileSystemService.js';

export class SkillRunner {
    private skills: Record<string, Skill> = {};
    private disk: FileSystemService;

    constructor(
        private project: Project,
        private driverRegistry: DriverRegistry,
        private promptEngine: PromptEngine,
        private host: RuntimeHost
    ) {
        this.disk = new FileSystemService();
        this.loadYamlSkills();
    }

    private loadYamlSkills(): void {
        const skillsDir = this.project.paths.skills;
        if (!this.disk.isDirectory(skillsDir)) {
            return;
        }

        const files = this.disk.listFiles(skillsDir);
        for (const filename of files) {
            if (filename.endsWith('.skill.yml') || filename.endsWith('.skill.yaml')) {
                const filePath = path.join(skillsDir, filename);
                const content = this.disk.readFile(filePath);
                try {
                    const profile = yaml.load(content) as Skill;
                    if (profile && profile.name) {
                        this.skills[profile.name] = profile;
                    }
                } catch (e) {
                    this.host.log('error', `Error loading skill profile ${filename}: ${(e as Error).message}`);
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
                        errors.push(`Skill '${name}' requires missing driver '${skill.provider}'.`);
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
                    errors.push(`Skill '${name}' uses driver '${driver.name}' which is not supported in the current environment.`);
                    continue;
                }

                if (!(await driver.validateSkill(skill))) {
                    errors.push(`Skill '${name}' failed validation for driver '${driver.name}'.`);
                }

            } catch (e) {
                errors.push(`Error validating skill '${name}': ${(e as Error).message}`);
            }
        }

        if (errors.length > 0) {
            throw new Error(`Skill validation failed:\n${errors.map(e => `- ${e}`).join('\n')}`);
        }

        this.host.log('debug', `Validated ${Object.keys(this.skills).length} skills successfully.`);
    }

    getSkills(): Skill[] {
        return Object.values(this.skills);
    }

    async runSkill(task: Task, userPrompt: string): Promise<void> {
        this.host.log('info', task.message);

        const profile = this.skills[task.skill];
        if (!profile) {
            throw new Error(`Skill '${task.skill}' not found.`);
        }

        await this.executeSkill(task, profile, userPrompt);
    }

    private async executeSkill(task: Task, profile: Skill, userPrompt: string): Promise<void> {
        // Determine which driver to use. 
        let driver;
        if (profile.provider) {
            this.host.log('debug', `[DEBUG] Skill ${profile.name} provider: ${profile.provider}`);
            driver = this.driverRegistry.get(profile.provider);
            if (!driver) {
                throw new Error(`Driver '${profile.provider}' not found.`);
            }
        } else {
            this.host.log('debug', `[DEBUG] Skill ${profile.name} has no provider, using default`);
            driver = this.driverRegistry.getDefault();
        }

        if (driver) {
            this.host.log('debug', `[DEBUG] Resolved driver: ${driver.name}`);
        }

        if (!driver) {
            throw new Error("No driver found for execution.");
        }

        let userPromptWithPersona = userPrompt;
        let personaContext = '';

        if (task.persona) {
            // Updated to use project paths
            const personaFile = path.join(this.project.paths.personas, `${task.persona}.md`);
            if (this.disk.exists(personaFile)) {
                personaContext = this.disk.readFile(personaFile);
            } else {
                this.host.log('warn', `Persona file not found: ${personaFile}`);
            }
        }

        userPromptWithPersona = this.promptEngine.render(this.project.paths.skillPrompt, {
            user_prompt: userPrompt,
            persona_context: personaContext
        });

        try {
            await driver.execute(profile, {
                userPrompt: userPromptWithPersona,
                taskId: task.id,
                taskPrompt: task.description,
                params: task.params
            });
        } catch (err) {
            this.host.log('error', `An error occurred while executing the skill ${task.skill}: ${err}`);
            throw err;
        }
    }
}
