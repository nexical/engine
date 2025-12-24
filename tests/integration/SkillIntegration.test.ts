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
import fs from 'fs-extra';
import path from 'path';

import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Skill Integration Integration', () => {
  let fixture: ProjectFixture;

  beforeEach(async () => {
    fixture = new ProjectFixture();
    await fixture.setup();
    // We bypass validation by default in fixture setup for convenience,
    // but for THESE tests we want validation to run or be manually controlled.
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  test('should discover and validate skills from YAML (Scenario 7)', async () => {
    await fixture.writeConfig({ project_name: 'SkillTest' });

    // 1. Create a custom skill file
    await fixture.writeSkill('custom-skill', {
      name: 'custom-skill',
      description: 'A test skill',
      provider: 'gemini',
      prompt_template: 'Do something with {{ user_prompt }}',
    });

    // 2. Initialize orchestration but rely on default bypass=true initially
    // because we want to setup mock driver BEFORE validation runs for real.
    const orchestrator = await fixture.initOrchestrator(true);

    // 3. Setup mock driver that validates successfully
    fixture.registerMockDriver('gemini', async () => ({ isFail: () => false, unwrap: () => 'OK', error: () => null }));
    // Add validateSkill to mock driver (registerMockDriver uses a default, we need to extend it)
    // We can access it directly since we know there is one 'gemini' driver.
    const driver = (orchestrator.brain as any).driverRegistry.get('gemini');
    driver.validateSkill = async () => true;

    // 4. Manually run validation
    const skillRunner = orchestrator.brain.getSkillRunner();
    // Reset the spy created by initOrchestrator(true) if any?
    // ProjectFixture implementation:
    // if (bypassValidation) jest.spyOn(SkillRunner.prototype, 'validateAvailableSkills').mockResolvedValue(undefined);
    // So we MockRestore that spy.
    // But we don't have reference to spy?
    // Actually, ProjectFixture uses SkiRunner.prototype... so it affects all instances.
    // We can restore it globally.
    jest.restoreAllMocks();
    // WARNING: restoreAllMocks might kill our fixture.mockHost spies if they are tracked by jest?
    // fixture.mockHost properties are jest.fn(). restoreAllMocks restores SPIES.
    // It shouldn't affect jest.fn() created standalone.
    // But initOrchestrator spy IS a spy.

    // Re-mock console to avoid noise if desired, but fixture does it via mockHost.
    // Wait, validateAvailableSkills uses Host.log.

    await skillRunner.validateAvailableSkills();

    const skills = skillRunner.getSkills();
    const customSkill = skills.find((s) => s.name === 'custom-skill');
    expect(customSkill).toBeDefined();
    expect(customSkill?.description).toBe('A test skill');

    // Check no error logs in fixture.mockHost.log
    expect(fixture.mockHost.log).not.toHaveBeenCalledWith('error', expect.stringContaining('Skill validation failed'));
  });

  test('should fail validation for invalid skill definitions (Scenario 12)', async () => {
    await fixture.writeConfig({ project_name: 'SkillFailTest' });

    // Create an invalid skill (missing name)
    // writeSkill writes what we pass.
    await fixture.writeSkill('invalid-skill', {
      description: 'Missing name',
      provider: 'gemini',
    });

    const orchestrator = await fixture.initOrchestrator(false);
    // false = run validation on init.
    // But validation errors are logged, not necessarily thrown if catch block exists?
    // SkillRunner logs error for individual file load failure but might continue?
    // check source: loads all, catch -> log error.

    expect(fixture.mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Error loading skill profile'));
  });

  test('should trigger driver-level validation (Scenario 12)', async () => {
    await fixture.writeConfig({ project_name: 'DriverValidTest' });
    await fixture.writeSkill('driver-test', {
      name: 'driver-test',
      provider: 'custom-driver',
    });

    // Initialize with validation bypassed so we can register the custom driver first
    const orchestrator = await fixture.initOrchestrator(true);

    // Setup mock driver that FAILS validation
    const mockDriver = {
      name: 'custom-driver',
      isSupported: async () => true,
      validateSkill: jest.fn<any>().mockResolvedValue(false), // Fail validation
      execute: jest.fn<any>(),
    };
    (orchestrator.brain as any).driverRegistry.register(mockDriver as any, true);

    // Restore validation logic
    jest.restoreAllMocks(); // Restore SkillRunner spy

    const skillRunner = orchestrator.brain.getSkillRunner();
    await expect(skillRunner.validateAvailableSkills()).rejects.toThrow('Skill validation failed');
    expect(mockDriver.validateSkill).toHaveBeenCalled();
  });
});
