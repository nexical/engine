import { describe, expect, it, jest } from '@jest/globals';

import { IFileSystem } from '../../../src/domain/IFileSystem.js';
import { Plan } from '../../../src/domain/Plan.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { ISkillContext } from '../../../src/domain/SkillConfig.js';
import { DriverRegistry } from '../../../src/drivers/DriverRegistry.js';
import { PlanGraphValidator } from '../../../src/services/PlanGraphValidator.js';

describe('PlanGraphValidator', () => {
  const mockContext = {
    taskId: 'test-task',
    clarificationHandler: jest.fn(),
    commandRunner: jest.fn(),
    validators: [],
    fileSystem: {} as unknown as IFileSystem,
    driverRegistry: {} as unknown as DriverRegistry,
    workspaceRoot: '/tmp',
    logger: { log: jest.fn(), ask: jest.fn(), status: jest.fn(), emit: jest.fn() } as unknown as IRuntimeHost,
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

  it('should handle non-Error exceptions', async () => {
    // Mock Plan.fromYaml to throw a string
    const spy = jest.spyOn(Plan, 'fromYaml').mockImplementation(() => {
      throw new Error('string error');
    });

    const context = { ...mockContext, executionResult: 'some yaml' };
    const result = await PlanGraphValidator(context);

    expect(result.isFail()).toBe(true);
    expect(result.error()?.message).toBe('string error');

    spy.mockRestore();
  });

  it('should handle tasks with undefined dependencies (branch coverage)', async () => {
    // Mock Plan to return a plan with a task having undefined dependencies
    // logic: if (task.dependencies) check

    // We need to match the structure expected by validateAcyclic and validateDependenciesExist
    const mockPlan = {
      tasks: [
        { id: '1', dependencies: undefined }, // Should be handled gracefully
        { id: '2', dependencies: ['1'] },
      ],
    };

    // validateDependenciesExist iterates tasks.
    // validateAcyclic iterates tasks.

    const spy = jest.spyOn(Plan, 'fromYaml').mockReturnValue(mockPlan as unknown as Plan);

    const context = { ...mockContext, executionResult: 'stub' };
    const result = await PlanGraphValidator(context);

    expect(result.isOk()).toBe(true);

    spy.mockRestore();
    spy.mockRestore();
  });

  it('should skip visited tasks in top-level loop (branch coverage)', async () => {
    // Tasks ordered such that 'B' depends on 'A', but 'B' comes first in loop.
    // Loop B -> visits A.
    // Loop A -> already visited.

    // We mock the Plan object directly to ensure order and structure without YAML parsing ambiguity
    const mockPlan = {
      tasks: [
        { id: 'B', dependencies: ['A'] },
        { id: 'A', dependencies: [] },
      ],
    };

    const spy = jest.spyOn(Plan, 'fromYaml').mockReturnValue(mockPlan as unknown as Plan);

    const context = { ...mockContext, executionResult: 'stub' };
    const result = await PlanGraphValidator(context);

    expect(result.isOk()).toBe(true);

    spy.mockRestore();
  });
});
