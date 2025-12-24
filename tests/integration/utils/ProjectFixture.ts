import { jest } from '@jest/globals';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import os from 'os';
import path from 'path';

import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { Orchestrator } from '../../../src/orchestrator.js';
import { SkillRunner } from '../../../src/services/SkillRunner.js';

export class ProjectFixture {
  public tmpDir: string;
  public orchestrator!: Orchestrator;
  public mockHost: any;

  constructor() {
    this.tmpDir = '';
    this.mockHost = {
      log: jest.fn(),
      emit: jest.fn(),
      ask: jest.fn<any>().mockResolvedValue('yes'),
    };
  }

  async setup(): Promise<void> {
    this.tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'astrical-fixture-'));
    await fs.ensureDir(path.join(this.tmpDir, '.ai/prompts'));
    await fs.ensureDir(path.join(this.tmpDir, '.ai/skills'));
    await fs.ensureDir(path.join(this.tmpDir, '.ai/personas'));

    await fs.writeJson(path.join(this.tmpDir, 'package.json'), { name: 'fixture-project' });

    // Default prompts to avoid "template not found" errors
    await this.writePrompt('architect.md', 'Architect {{ project_name }}');
    await this.writePrompt('planner.md', 'Planner {{ project_name }}');
    await this.writePrompt('skill.md', 'Skill Runner');
  }

  async cleanup(): Promise<void> {
    if (this.tmpDir && fs.existsSync(this.tmpDir)) {
      await fs.remove(this.tmpDir);
    }
    jest.restoreAllMocks();
  }

  async writeConfig(config: any): Promise<void> {
    await fs.writeFile(path.join(this.tmpDir, '.ai/config.yml'), yaml.dump(config));
  }

  async writePrompt(name: string, content: string): Promise<void> {
    await fs.writeFile(path.join(this.tmpDir, '.ai/prompts', name), content);
  }

  async writeSkill(name: string, content: any): Promise<void> {
    await fs.writeFile(path.join(this.tmpDir, '.ai/skills', `${name}.skill.yaml`), yaml.dump(content));
  }

  async initOrchestrator(bypassValidation = true): Promise<Orchestrator> {
    if (bypassValidation) {
      jest.spyOn(SkillRunner.prototype, 'validateAvailableSkills').mockResolvedValue(undefined);
    }
    this.orchestrator = new Orchestrator(this.tmpDir, this.mockHost);
    await this.orchestrator.init();
    return this.orchestrator;
  }

  registerMockDriver(name: string, executeImpl?: (skill: any, options: any) => Promise<any>): any {
    const mockDriver = {
      name,
      isSupported: async () => true,
      execute: jest
        .fn<any>()
        .mockImplementation(
          executeImpl || (async () => ({ isFail: () => false, unwrap: () => 'OK', error: () => null })),
        ),
    };
    (this.orchestrator.brain as any).driverRegistry.register(mockDriver as any, true);
    return mockDriver;
  }

  static createArchitectResult(components: string[] = ['comp1']): string {
    return `## 1. Solution Overview\nOverview\n## 2. Proposed File Structure\nFiles\n## 3. Key Components & Contracts\n${components.map((c) => `- ${c}`).join('\n')}\n## 4. Implementation Details\nNone`;
  }

  static createPlanResult(
    tasks: any[] = [{ id: 't1', skill: 'developer', message: 'done', description: 'desc' }],
  ): string {
    return yaml.dump({
      plan_name: 'Fixture Plan',
      tasks,
    });
  }
}
