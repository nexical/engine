import path from 'path';
import yaml from 'js-yaml';
import { Task } from '../models/Task.js';
import { Skill } from '../interfaces/Skill.js';
import type { Orchestrator } from '../orchestrator.js';

export class SkillRunner {
    private skills: Record<string, Skill> = {};

    constructor(
        private core: Orchestrator
    ) {
        this.loadYamlSkills();
    }

    private loadYamlSkills(): void {
        if (!this.core.disk.isDirectory(this.core.config.skillsDirectory)) {
            return;
        }

        const files = this.core.disk.listFiles(this.core.config.skillsDirectory);
        for (const filename of files) {
            if (filename.endsWith('.skill.yml') || filename.endsWith('.skill.yaml')) {
                const filePath = path.join(this.core.config.skillsDirectory, filename);
                const content = this.core.disk.readFile(filePath);
                try {
                    const profile = yaml.load(content) as Skill;
                    if (profile && profile.name) {
                        this.skills[profile.name] = profile;
                    }
                } catch (e) {
                    this.core.host.log('error', `Error loading skill profile ${filename}: ${(e as Error).message}`);
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
                    driver = this.core.driverRegistry.get(skill.provider);
                    if (!driver) {
                        errors.push(`Skill '${name}' requires missing driver '${skill.provider}'.`);
                        continue;
                    }
                } else {
                    driver = this.core.driverRegistry.getDefault();
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

        this.core.host.log('debug', `Validated ${Object.keys(this.skills).length} skills successfully.`);
    }

    getSkills(): Skill[] {
        return Object.values(this.skills);
    }

    async runSkill(task: Task, userPrompt: string): Promise<void> {
        this.core.host.log('info', task.message);

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
            this.core.host.log('debug', `[DEBUG] Skill ${profile.name} provider: ${profile.provider}`);
            driver = this.core.driverRegistry.get(profile.provider);
            if (!driver) {
                throw new Error(`Driver '${profile.provider}' not found.`);
            }
        } else {
            this.core.host.log('debug', `[DEBUG] Skill ${profile.name} has no provider, using default`);
            driver = this.core.driverRegistry.getDefault();
        }

        if (driver) {
            this.core.host.log('debug', `[DEBUG] Resolved driver: ${driver.name}`);
        }

        if (!driver) {
            throw new Error("No driver found for execution.");
        }

        let userPromptWithPersona = userPrompt;
        let personaContext = '';

        if (task.persona) {
            const personaFile = path.join(this.core.config.personasDirectory, `${task.persona}.md`);
            if (this.core.disk.exists(personaFile)) {
                personaContext = this.core.disk.readFile(personaFile);
            } else {
                this.core.host.log('warn', `Persona file not found: ${personaFile}`);
            }
        }

        userPromptWithPersona = this.core.promptEngine.render(this.core.config.skillPromptFile, {
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
            this.core.host.log('error', `An error occurred while executing the skill ${task.skill}: ${err}`);
            throw err;
        }
    }
}
