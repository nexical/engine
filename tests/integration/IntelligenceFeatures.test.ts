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
import path from 'path';

import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Intelligence Features Integration', () => {
  let fixture: ProjectFixture;

  beforeEach(async () => {
    fixture = new ProjectFixture();
    await fixture.setup();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  test('should inject evolution log and persona context into prompts (Scenario 5 & 10)', async () => {
    await fixture.writeConfig({ project_name: 'IntelTest' });

    // Custom prompts that use the variables we want to verify
    await fixture.writePrompt('architect.md', 'Evolution: {{ evolution_log }}. Personas: {{ personas_dir }}');
    await fixture.writePrompt('skill.md', 'Persona content: {{ persona_context }}');

    const orchestrator = await fixture.initOrchestrator();

    // 1. Manually add a failure record to evolution service
    const evolution = orchestrator.brain.getEvolution();
    await (evolution as any).recordFailure('PREVIOUS_STATE', { type: 'FAIL', reason: 'Too much coffee' }, []);

    // 2. Add a custom persona file
    // We can access the project paths via the orchestrator
    const personaDir = orchestrator.project.paths.personas;
    await fs.ensureDir(personaDir);
    await fs.writeFile(path.join(personaDir, 'expert.md'), 'Expert instructions');

    let capturedArchitectPrompt = '';
    let capturedSkillPrompt = '';

    fixture.registerMockDriver('gemini', async (skill: any, ctx: any) => {
      if (skill.name === 'architect') {
        capturedArchitectPrompt = ctx.params.prompt;
        return { isFail: () => false, unwrap: () => ProjectFixture.createArchitectResult(), error: () => null };
      }
      // For the skill execution
      if (skill.name === 'test-skill') {
        capturedSkillPrompt = ctx.userPrompt;
        return { isFail: () => false, unwrap: 'OK', error: () => null };
      }
      return { isFail: () => false, unwrap: 'OK', error: () => null };
    });

    // Run Architect (Scenario 5)
    const architect = orchestrator.brain.createArchitect(orchestrator.workspace);
    // We mock getArchitecture to avoid reading file (optional, but good for isolation)
    jest.spyOn(orchestrator.workspace, 'getArchitecture').mockResolvedValue({ id: 'arch' } as any);
    await architect.design('Test evolution');

    expect(capturedArchitectPrompt).toContain('Too much coffee');

    // Run Skill with Persona (Scenario 10)
    const skillRunner = orchestrator.brain.getSkillRunner();
    // Register a dummy skill dynamically for testing
    (skillRunner as any).skills['test-skill'] = { name: 'test-skill', provider: 'gemini' };

    await skillRunner.runSkill(
      {
        id: 'task-1',
        skill: 'test-skill',
        persona: 'expert',
        message: 'Doing task',
        description: 'desc',
        params: {},
      } as any,
      'Hello',
    );

    expect(capturedSkillPrompt).toContain('Expert instructions');
  });

  test('should persist evolution logs across sessions (Scenario 15)', async () => {
    await fixture.writeConfig({ project_name: 'PersistenceTest' });

    // 1. First run records a failure
    const orchestrator1 = await fixture.initOrchestrator();
    const evolution1 = orchestrator1.brain.getEvolution();
    await evolution1.recordFailure('TEST_STATE', { type: 'REPLAN', reason: 'Need more detail' } as any);

    const logFile = orchestrator1.project.paths.log;
    expect(fs.existsSync(logFile)).toBe(true);

    // 2. Second run loads it (ProjectFixture keeps the same temp dir)
    const orchestrator2 = await fixture.initOrchestrator();
    const evolution2 = orchestrator2.brain.getEvolution();
    // Force load logic or check summary
    const summary = evolution2.getLogSummary();

    expect(summary).toContain('Need more detail');
    expect(summary).toContain('REPLAN');
  });
});
