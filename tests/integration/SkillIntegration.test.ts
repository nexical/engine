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
 * - SkillRegistry.init() logic.
 * - Loading of .ai/skills/*.skill.yaml files.
 * - Error handling for malformed skills.
 * - Driver.validateConfig logic.
 */

import { jest } from '@jest/globals';

import { Result } from '../../src/domain/Result.js';
import { DriverConfig } from '../../src/domain/SkillConfig.js';
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
    await fixture.writeSkill('test-skill', { name: 'test-skill', execution: { provider: 'gemini' } });
    await fixture.writeConfig({ project_name: 'SkillTest' });

    const orchestrator = await fixture.initOrchestrator(true);
    fixture.registerMockDriver('gemini');
    await orchestrator.brain.init();
    const skillRegistry = orchestrator.brain.getSkillRegistry();

    const skills = skillRegistry.getSkills();
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

    await fixture.initOrchestrator();

    expect(fixture.mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Error loading skill profile'));
  });

  test('should trigger driver-level validation (Scenario 12)', async (): Promise<void> => {
    await fixture.writeConfig({ project_name: 'DriverValidTest' });
    await fixture.writeSkill('test-validation', { name: 'test-validation', execution: { provider: 'validation-fail-driver' } });

    // Initialize without running init() immediately so we can register mocks
    const orchestrator = await fixture.initOrchestrator(true);

    const mockDriver = {
      name: 'validation-fail-driver',
      description: 'Custom Test Driver',
      isSupported: async (): Promise<boolean> => {
        return Promise.resolve(true);
      },
      validateConfig: jest.fn<(config: DriverConfig) => Promise<boolean>>().mockResolvedValue(false),
      execute: jest.fn<() => Promise<Result<string, Error>>>().mockResolvedValue(Result.ok('mocked execution')),
    };
    // Register driver
    const brain = orchestrator.brain as unknown as {
      driverRegistry: { register: (driver: unknown, force: boolean) => void };
    };
    brain.driverRegistry.register(mockDriver, true);

    const skillRegistry = orchestrator.brain.getSkillRegistry();

    // Now assume we want to init
    await orchestrator.brain.init();

    // Verify it is there
    expect(skillRegistry.getSkills().some((s) => s.name === 'test-validation')).toBe(true);

    expect(mockDriver.validateConfig).toHaveBeenCalled();
  });
});
