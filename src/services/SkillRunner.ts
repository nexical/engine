import path from 'path';
import yaml from 'js-yaml';
import debug from 'debug';
import { Task } from '../models/Task.js';
import { Skill } from '../models/Skill.js';
import type { Orchestrator } from '../orchestrator.js';

const log = debug('skill-runner');

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
                    console.error(`Error loading skill profile ${filename}:`, e);
                }
            }
        }
    }

    async runSkill(task: Task, userPrompt: string): Promise<void> {
        console.log(task.message);

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
            console.log(`[DEBUG] Skill ${profile.name} provider: ${profile.provider}`);
            driver = this.core.driverRegistry.get(profile.provider);
            if (!driver) {
                throw new Error(`Driver '${profile.provider}' not found.`);
            }
        } else {
            console.log(`[DEBUG] Skill ${profile.name} has no provider, using default`);
            driver = this.core.driverRegistry.getDefault();
        }

        if (driver) {
            console.log(`[DEBUG] Resolved driver: ${driver.name}`);
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
                console.warn(`Persona file not found: ${personaFile}`);
            }
        }

        userPromptWithPersona = this.core.promptEngine.render(this.core.config.skillPromptFile, {
            user_prompt: userPrompt,
            persona_context: personaContext
        });

        try {
            await driver.execute(profile, task.description, {
                userPrompt: userPromptWithPersona,
                taskId: task.id,
                params: task.params
            });
        } catch (err) {
            console.error(`An error occurred while executing the skill ${task.skill}: ${err}`);
            throw err;
        }
    }
}
