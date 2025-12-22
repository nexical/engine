import { describe, it, expect } from '@jest/globals';
import { Plan } from '../../../src/domain/Plan.js';
import { Task } from '../../../src/domain/Task.js';

describe('Plan Model', () => {
    it('should create a plan with tasks', () => {
        const tasks = [
            new Task('1', 'Task 1', 'Desc 1', 'skill1'),
            new Task('2', 'Task 2', 'Desc 2', 'skill2')
        ];
        const plan = new Plan('test-plan', tasks);

        expect(plan.plan_name).toBe('test-plan');
        expect(plan.tasks).toHaveLength(2);
        expect(plan.getTask('1')).toBe(tasks[0]);
    });

    it('should serialize to YAML', () => {
        const task = new Task('1', 'Task 1', 'Desc 1', 'skill1');
        const plan = new Plan('yaml-plan', [task]);
        const yamlOutput = plan.toYaml();

        expect(yamlOutput).toContain('plan_name: yaml-plan');
        expect(yamlOutput).toContain("id: '1'");
    });

    it('should deserialize from YAML', () => {
        const yamlInput = `
plan_name: restored-plan
tasks:
  - id: "1"
    message: "Restored Task"
    description: "Restored Desc"
    skill: "restored-skill"
`;
        const plan = Plan.fromYaml(yamlInput);
        expect(plan.plan_name).toBe('restored-plan');
        expect(plan.tasks).toHaveLength(1);
        expect(plan.tasks[0]).toBeInstanceOf(Task);
        expect(plan.tasks[0].id).toBe("1");
    });
});
