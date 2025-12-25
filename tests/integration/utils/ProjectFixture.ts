import { jest } from '@jest/globals';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import os from 'os';
import path from 'path';

import { IDriverContext, ISkill } from '../../../src/domain/Driver.js';
import { Result } from '../../../src/domain/Result.js';
import { Orchestrator } from '../../../src/orchestrator.js';
import { SkillRunner } from '../../../src/services/SkillRunner.js';

export class ProjectFixture {
  public tmpDir: string;
  public orchestrator!: Orchestrator;
  public mockHost: {
    log: jest.Mock<(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: unknown) => void>;
    emit: jest.Mock<(event: string, data: unknown) => void>;
    ask: jest.Mock<
      (msg: string, type?: 'text' | 'confirm' | 'select', options?: string[]) => Promise<string | boolean>
    >;
    status: jest.Mock<(status: string) => void>;
  };

  constructor() {
    this.tmpDir = '';
    this.mockHost = {
      log: jest.fn<(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: unknown) => void>(),
      emit: jest.fn<(event: string, data: unknown) => void>(),
      ask: jest
        .fn<(msg: string, type?: 'text' | 'confirm' | 'select', options?: string[]) => Promise<string | boolean>>()
        .mockResolvedValue('yes'),
      status: jest.fn<(status: string) => void>(),
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

    // Initialize Git Repo for Worktree Support
    try {
      const { execSync } = await import('child_process');
      const cleanEnv = { ...process.env };
      const keysToRemove = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX'];
      for (const key of keysToRemove) {
        delete cleanEnv[key];
      }

      const execOptions = { cwd: this.tmpDir, env: cleanEnv };

      execSync('git init', execOptions);
      execSync('git config user.email "test@example.com"', execOptions);
      execSync('git config user.name "Test User"', execOptions);
      // Track initial files to avoid merge collisions with untracked files later
      execSync('git add .', execOptions);
      // Create initial commit to allow worktrees
      execSync('git commit -m "Initial commit"', execOptions);
    } catch (e) {
      this.mockHost.log('warn', `Failed to init git in fixture: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async cleanup(): Promise<void> {
    if (this.tmpDir && (await fs.pathExists(this.tmpDir))) {
      await fs.remove(this.tmpDir);
    }
    jest.restoreAllMocks();
  }

  async writeConfig(config: Record<string, unknown>): Promise<void> {
    await fs.writeFile(path.join(this.tmpDir, '.ai/config.yml'), yaml.dump(config));
  }

  async writePrompt(name: string, content: string): Promise<void> {
    await fs.writeFile(path.join(this.tmpDir, '.ai/prompts', name), content);
  }

  async writeSkill(name: string, content: Record<string, unknown>): Promise<void> {
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

  registerMockDriver(
    name: string,
    executeImpl?: (skill: ISkill, options?: IDriverContext) => Promise<Result<string, Error>>,
  ): {
    name: string;
    description: string;
    isSupported: () => Promise<boolean>;
    validateSkill: jest.Mock<(skill: ISkill) => Promise<boolean>>;
    execute: jest.Mock<(skill: ISkill, options?: IDriverContext) => Promise<Result<string, Error>>>;
  } {
    const mockDriver = {
      name,
      description: `Mock driver for ${name}`,
      isSupported: async (): Promise<boolean> => {
        return Promise.resolve(true);
      },
      validateSkill: jest.fn<(skill: ISkill) => Promise<boolean>>().mockResolvedValue(true),
      execute: jest
        .fn<(skill: ISkill, options?: IDriverContext) => Promise<Result<string, Error>>>()
        .mockImplementation(async (skill, options) => {
          if (executeImpl) return executeImpl(skill, options);
          return Result.ok('OK');
        }),
    };
    const brainMock = this.orchestrator.brain as unknown as {
      driverRegistry: { register: (driver: unknown, force: boolean) => void };
    };
    brainMock.driverRegistry.register(mockDriver, true);
    return mockDriver;
  }

  static createArchitectResult(components: string[] = ['comp1']): string {
    return `## 1. Solution Overview\nOverview\n## 2. Proposed File Structure\nFiles\n## 3. Key Components & Contracts\n${components.map((c) => `- ${c}`).join('\n')}\n## 4. Implementation Details\nNone`;
  }

  static createPlanResult(
    tasks: Record<string, unknown>[] = [{ id: 't1', skill: 'executor', message: 'done', description: 'desc' }],
  ): string {
    return yaml.dump({
      plan_name: 'Fixture Plan',
      tasks,
    });
  }
}
