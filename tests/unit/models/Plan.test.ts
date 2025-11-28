import { expect, describe, it } from '@jest/globals';
import { PlanUtils } from '../../../src/models/Plan.js';
import type { Plan } from '../../../src/models/Plan.js';

describe('PlanUtils', () => {
    describe('toYaml', () => {
        it('should convert plan to YAML string', () => {
            const plan: Plan = {
                plan_name: 'Test Plan',
                tasks: [
                    {
                        id: 'task-1',
                        description: 'Task 1',
                        message: 'Doing task 1',
                        agent: 'agent-1'
                    }
                ]
            };

            const yamlString = PlanUtils.toYaml(plan);
            expect(yamlString).toContain('plan_name: Test Plan');
            expect(yamlString).toContain('id: task-1');
        });
    });

    describe('fromYaml', () => {
        it('should parse YAML string to plan', () => {
            const yamlString = `
plan_name: Test Plan
tasks:
  - id: task-1
    description: Task 1
    message: Doing task 1
    agent: agent-1
`;
            const plan = PlanUtils.fromYaml(yamlString);
            expect(plan.plan_name).toBe('Test Plan');
            expect(plan.tasks).toHaveLength(1);
            expect(plan.tasks[0].id).toBe('task-1');
        });

        it('should handle empty tasks', () => {
            const yamlString = `
plan_name: Test Plan
`;
            const plan = PlanUtils.fromYaml(yamlString);
            expect(plan.plan_name).toBe('Test Plan');
            expect(plan.tasks).toEqual([]);
        });
    });
});
