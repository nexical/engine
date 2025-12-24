/**
 * @file SkillIntegration.test.ts
 *
 * SCOPE:
 * This test verifies the Skill integration subsystem.
 * It ensures that skills defined in YAML are correctly discovered, loaded, and validated
 * by the SkillRunner. It also tests validation failures (invalid schema) and
 * driver-level compatibility checks.
 *
 * COVERAGE:
 * - SkillRunner.validateAvailableSkills() logic.
 * - Loading of .ai/skills/*.skill.yaml files.
 * - Error handling for malformed skills.
 * - Driver.validateSkill logic.
 */

import { jest } from '@jest/globals';

import { ISkill } from '../../src/domain/Driver.js';
import { Result } from '../../src/domain/Result.js';
import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Skill Integration', () => {
  let fixture: ProjectFixture;

  beforeEach(async (): Promise<void> => {
    fixture = new ProjectFixture();
    await fixture.setup();
    // We bypass validation by default in fixture setup for convenience,
    // but for THESE tests we want validation to run or be manually controlled.
  });

  afterEach(async (): Promise<void> => {
    await fixture.cleanup();
  });

  test('should discover and validate available skills (Scenario 8)', async (): Promise<void> => {
    await fixture.writeSkill('test-skill', { name: 'test-skill', provider: 'gemini' });
    await fixture.writeConfig({ project_name: 'SkillTest' });

    const orchestrator = await fixture.initOrchestrator();
    const skillRunner = orchestrator.brain.getSkillRunner();
    await skillRunner.validateAvailableSkills();

    const skills = skillRunner.getSkills();
    expect(skills.some((s) => s.name === 'test-skill')).toBe(true);

    // Check no error logs in fixture.mockHost.log
    expect(fixture.mockHost.log).not.toHaveBeenCalledWith('error', expect.stringContaining('Skill validation failed'));
  });

  test('should fail validation for invalid skill definitions (Scenario 12)', async (): Promise<void> => {
    await fixture.writeConfig({ project_name: 'SkillFailTest' });

    // Create an invalid skill (missing name)
    await fixture.writeSkill('invalid-skill', {
      description: 'Missing name',
      provider: 'gemini',
    } as unknown as Record<string, unknown>);

    await fixture.initOrchestrator(true);

    expect(fixture.mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Error loading skill profile'));
  });

  test('should trigger driver-level validation (Scenario 12)', async (): Promise<void> => {
    await fixture.writeConfig({ project_name: 'DriverValidTest' });
    const orchestrator = await fixture.initOrchestrator(true);

    const mockDriver = {
      name: 'validation-fail-driver',
      description: 'Custom Test Driver',
      isSupported: async (): Promise<boolean> => {
        return Promise.resolve(true);
      },
      validateSkill: jest.fn<(skill: ISkill) => Promise<boolean>>().mockResolvedValue(false),
      execute: jest.fn<() => Promise<Result<string, Error>>>().mockResolvedValue(Result.ok('mocked execution')),
    };
    // Register driver
    const brain = orchestrator.brain as unknown as {
      driverRegistry: { register: (driver: unknown, force: boolean) => void };
    };
    brain.driverRegistry.register(mockDriver, true);

    const skillRunner = orchestrator.brain.getSkillRunner();
    // The fixture's initOrchestrator(true) mocks validateAvailableSkills.
    // We need to capture that mock to restore it.
    const validateSpy = jest.spyOn(skillRunner, 'validateAvailableSkills');

    // Restore the mock so we can test the real logic
    // Restore the spy

    (validateSpy as unknown as { mockRestore: () => void }).mockRestore();

    // Register a skill that uses this driver
    const testSkill = { name: 'test-validation', provider: 'validation-fail-driver' } as unknown as ISkill;

    const skillRunnerInternal = skillRunner as unknown as { skills: Record<string, ISkill> };
    skillRunnerInternal.skills['test-validation'] = testSkill;

    // Verify it is there
    expect(skillRunner.getSkills().some((s) => s.name === 'test-validation')).toBe(true);

    // We expect it to throw 'Skill validation failed'
    await expect(skillRunner.validateAvailableSkills()).rejects.toThrow(/Skill validation failed/);
    expect(mockDriver.validateSkill).toHaveBeenCalled();
  });
});
