import { describe, it, expect, jest } from '@jest/globals';
import { PlanGraphValidator } from '../../../src/services/PlanGraphValidator.js';
import { ISkillContext } from '../../../src/domain/SkillConfig.js';
import { Result } from '../../../src/domain/Result.js';

describe('PlanGraphValidator', () => {
  const mockContext: ISkillContext = {
    taskId: 'test-task',
    clarificationHandler: jest.fn(),
    commandRunner: jest.fn(),
    validators: [],
    fileSystem: {},
    driverRegistry: {},
    workspaceRoot: '/tmp',
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  } as unknown as ISkillContext;

  it('should pass for a valid acyclic plan', async () => {
    const validYaml = `
plan_name: Valid Plan
tasks:
  - id: "1"
    description: task 1
    message: task 1 message
    skill: test-skill
    dependencies: []
  - id: "2"
    description: task 2
    message: task 2 message
    skill: test-skill
    dependencies: ['1']
`;
    const context = { ...mockContext, executionResult: validYaml };
    const result = await PlanGraphValidator(context);

    expect(result.isOk()).toBe(true);
    expect(result.unwrap()).toBe(true);
  });

  it('should fail if executionResult is missing', async () => {
    const context = { ...mockContext };
    const result = await PlanGraphValidator(context);

    expect(result.isFail()).toBe(true);
    expect(result.error()?.message).toContain('No execution result found');
  });

  it('should fail for invalid YAML/Schema', async () => {
    const invalidYaml = `
plan_name: Invalid
tasks:
  - description: No ID
`;
    const context = { ...mockContext, executionResult: invalidYaml };
    const result = await PlanGraphValidator(context);

    expect(result.isFail()).toBe(true);
    // Zod error or yaml error
  });

  it('should fail for missing dependencies', async () => {
    const missingDepYaml = `
plan_name: Missing Dep
tasks:
  - id: "2"
    description: task 2
    message: task 2 message
    skill: test-skill
    dependencies: ['1'] 
`;
    // Task 1 is missing
    const context = { ...mockContext, executionResult: missingDepYaml };
    const result = await PlanGraphValidator(context);

    expect(result.isFail()).toBe(true);
    expect(result.error()?.message).toContain('Task 2 depends on non-existent task 1');
  });

  it('should fail for cyclical dependencies (direct)', async () => {
    const cycleYaml = `
plan_name: Cycle Direct
tasks:
  - id: "1"
    description: task 1
    message: task 1 message
    skill: test-skill
    dependencies: ['1']
`;
    const context = { ...mockContext, executionResult: cycleYaml };
    const result = await PlanGraphValidator(context);
    expect(result.isFail()).toBe(true);
    expect(result.error()?.message).toContain('Cycle detected');
  });

  it('should fail for cyclical dependencies (indirect)', async () => {
    const cycleYaml = `
plan_name: Cycle Indirect
tasks:
  - id: "1"
    description: task 1
    message: task 1 message
    skill: test-skill
    dependencies: ['2']
  - id: "2"
    description: task 2
    message: task 2 message
    skill: test-skill
    dependencies: ['1']
`;
    const context = { ...mockContext, executionResult: cycleYaml };
    const result = await PlanGraphValidator(context);
    expect(result.isFail()).toBe(true);
    expect(result.error()?.message).toContain('Cycle detected');
  });
});
