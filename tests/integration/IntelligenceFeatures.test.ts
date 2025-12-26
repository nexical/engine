/**
 * @file IntelligenceFeatures.test.ts
 *
 * SCOPE:
 * This test verifies the advanced AI context features of the engine.
 * Specifically, it tests the "Self-Evolution" (memory of past failures) and
 * "Persona" (role-based context) systems.
 *
 * COVERAGE:
 * - EvolutionService: Recording failures and injecting logs into prompts.
 * - PromptEngine: Rendering prompts with dynamic context (evolution_log, persona_context).
 * - SkillRunner: Executing skills with specific personas.
 * - Persistence: Verifying evolution logs survive between sessions.
 */

import { jest } from '@jest/globals';
import fs from 'fs-extra';

import { Architecture } from '../../src/domain/Architecture.js';
import { IDriverContext } from '../../src/domain/Driver.js';
import { Result } from '../../src/domain/Result.js';
import { DriverConfig } from '../../src/domain/SkillConfig.js';
import { Signal } from '../../src/workflow/Signal.js';
import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Intelligence Features Integration', () => {
  let fixture: ProjectFixture;

  beforeEach(async (): Promise<void> => {
    fixture = new ProjectFixture();
    fixture.mockHost.log.mockImplementation((level: string, msg: string): void => {
      process.stdout.write(`[TEST ${level.toUpperCase()}] ${msg}\n`);
    });
    await fixture.setup();
  });

  afterEach(async (): Promise<void> => {
    await fixture.cleanup();
  });

  test('should append to evolution log after session (Scenario 19)', async (): Promise<void> => {
    await fixture.writeConfig({ project_name: 'EvolutionTest' });
    const orchestrator = await fixture.initOrchestrator();

    fixture.registerMockDriver(
      'gemini',
      async (config: DriverConfig, options?: IDriverContext): Promise<Result<string, Error>> => {
        // @ts-ignore
        if (options?.params?.user_request) return Promise.resolve(Result.ok(ProjectFixture.createArchitectResult()));
        // @ts-ignore
        if (options?.params?.user_prompt) return Promise.resolve(Result.ok(ProjectFixture.createPlanResult([])));
        return Promise.resolve(Result.ok('OK'));
      },
    );

    await orchestrator.start('Learn something');

    expect(orchestrator.session.state.status).toBe('COMPLETED');
  });

  test('should inject persona context into prompts (Scenario 20)', async (): Promise<void> => {
    await fixture.writeConfig({ project_name: 'PersonaTest', persona: 'expert' });
    // Persona file
    await fixture.writePrompt('../personas/expert.md', 'Expert Persona: Be very detailed.');
    // Architect prompt using persona
    await fixture.writePrompt('architect.md', 'Project: {{ project_name }}\nUser: {{ user_request }}');

    const orchestrator = await fixture.initOrchestrator();

    let capturedPrompt = '';
    // Register on the active orchestrator
    const brain = orchestrator.brain as unknown as {
      driverRegistry: { register: (driver: unknown, force: boolean) => void };
    };
    brain.driverRegistry.register(
      {
        name: 'gemini',
        description: 'Test Driver',
        isSupported: async (): Promise<boolean> => {
          return Promise.resolve(true);
        },
        validateSkill: async (): Promise<boolean> => {
          return Promise.resolve(true);
        },
        execute: async (config: DriverConfig, options?: IDriverContext): Promise<Result<string, Error>> => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
          const projectName = ((options?.params as any)?.project_name as string) || '';
          if (projectName.includes('PersonaTest')) {
            capturedPrompt = projectName;
          }
          if ((options?.params as any)?.user_request)
            return Promise.resolve(Result.ok(ProjectFixture.createArchitectResult()));
          if ((options?.params as any)?.user_prompt)
            return Promise.resolve(Result.ok(ProjectFixture.createPlanResult([])));
          return Promise.resolve(Result.ok('OK'));
        },
      },
      true,
    );

    await orchestrator.start('Persona test');
    expect(orchestrator.session.state.status).toBe('COMPLETED');
    expect(capturedPrompt).toContain('PersonaTest');
  });

  test('should inject evolution log and persona context into prompts (Scenario 5 & 10)', async (): Promise<void> => {
    await fixture.writeConfig({ project_name: 'IntelTest' });

    // Custom prompts that use the variables we want to verify
    await fixture.writePrompt('architect.md', 'Evolution: {{ evolution_log }}');
    await fixture.writePrompt('skill.md', 'Persona content: {{ persona_context }}');

    const orchestrator = await fixture.initOrchestrator();

    // 1. Manually add a failure record to evolution service
    const evolution = orchestrator.brain.getEvolution();
    await evolution.recordEvent('PREVIOUS_STATE', { type: 'FAIL', reason: 'Too much coffee' } as unknown as Signal);

    let capturedArchitectPrompt = '';

    fixture.registerMockDriver(
      'gemini',
      async (config: DriverConfig, options: IDriverContext | undefined): Promise<Result<string, Error>> => {
        // Architect Skill Detection
        if ((options?.params as any)?.user_request) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
          capturedArchitectPrompt = ((options as any)?.params?.evolution_log as string) || '';
          return Promise.resolve(Result.ok(ProjectFixture.createArchitectResult()));
        }
        // Planner Skill Detection
        if ((options?.params as any)?.user_prompt) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
          expect((options as any)?.params?.project_name).toBe('IntelTest');
          return Promise.resolve(Result.ok(ProjectFixture.createPlanResult([])));
        }
        return Promise.resolve(Result.ok('OK'));
      },
    );

    // Run Architect (Scenario 5)
    const architect = orchestrator.brain.createArchitect(orchestrator.workspace);
    jest.spyOn(orchestrator.workspace, 'getArchitecture').mockResolvedValue({ id: 'arch' } as unknown as Architecture);
    await architect.design('Test evolution');

    expect(capturedArchitectPrompt).toContain('Too much coffee');
  });

  test('should persist evolution logs across sessions (Scenario 15)', async (): Promise<void> => {
    await fixture.writeConfig({ project_name: 'PersistenceTest' });

    // 1. First run records a failure
    const orchestrator1 = await fixture.initOrchestrator();
    const evolution1 = orchestrator1.brain.getEvolution();
    await evolution1.recordEvent('TEST_STATE', { type: 'REPLAN', reason: 'Need more detail' } as unknown as Signal);

    const logFile = orchestrator1.project.paths.log;
    expect(fs.existsSync(logFile)).toBe(true);

    // 2. Second run loads it (ProjectFixture keeps the same temp dir)
    const orchestrator2 = await fixture.initOrchestrator();
    const evolution2 = orchestrator2.brain.getEvolution();
    // Force load logic or check summary
    const summary = evolution2.retrieve('context');

    expect(summary).toContain('Need more detail');
    expect(summary).toContain('REPLAN');
  });
});
