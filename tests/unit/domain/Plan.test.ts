
import { Plan } from '../../../src/domain/Plan.js';
import { Task } from '../../../src/domain/Task.js';

describe('Plan', () => {
    it('should accept tasks in constructor', () => {
        const tasks = [new Task('1', 'msg', 'desc', 'skill')];
        const plan = new Plan('My Plan', tasks);
        expect(plan.tasks).toHaveLength(1);
    });

    it('should add tasks', () => {
        const plan = new Plan('My Plan');
        plan.addTask(new Task('1', 'msg', 'desc', 'skill'));
        expect(plan.tasks).toHaveLength(1);
    });

    it('should get task by id', () => {
        const task = new Task('1', 'msg', 'desc', 'skill');
        const plan = new Plan('My Plan', [task]);
        expect(plan.getTask('1')).toBe(task);
        expect(plan.getTask('2')).toBeUndefined();
    });

    it('should deserialize from YAML', () => {
        const yaml = `
plan_name: Test Plan
tasks:
  - id: t1
    description: d1
    message: m1
    skill: s1
`;
        const plan = Plan.fromYaml(yaml);
        expect(plan.plan_name).toBe('Test Plan');
        expect(plan.tasks).toHaveLength(1);
        expect(plan.tasks[0].id).toBe('t1');
    });

    it('should serialize to YAML', () => {
        const plan = new Plan('Test Plan', [new Task('t1', 'm1', 'd1', 's1')]);
        const yaml = plan.toYaml();
        expect(yaml).toContain('plan_name: Test Plan');
        expect(yaml).toContain('id: t1');
    });
});
