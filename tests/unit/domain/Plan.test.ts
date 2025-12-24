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

  it('should generate random id if missing from YAML', () => {
    const yaml = `
plan_name: No ID Plan
tasks:
  - description: d
    message: m
    skill: s
`;
    const plan = Plan.fromYaml(yaml);
    expect(plan.tasks[0].id).toBeDefined();
    expect(plan.tasks[0].id).toMatch(/^task-/);
  });

  it('should serialize to YAML', () => {
    const plan = new Plan('Test Plan', [new Task('t1', 'm1', 'd1', 's1')]);
    const yaml = plan.toYaml();
    expect(yaml).toContain('plan_name: Test Plan');
    expect(yaml).toContain('id: t1');
  });

  describe('getExecutionLayers', () => {
    it('should return tasks in layers based on dependencies', () => {
      const t1 = new Task('1', 'm1', 'd1', 's1');
      const t2 = new Task('2', 'm2', 'd2', 's2');
      const t3 = new Task('3', 'm3', 'd3', 's3', undefined, undefined, ['1', '2']);
      const t4 = new Task('4', 'm4', 'd4', 's4', undefined, undefined, ['3']);

      const plan = new Plan('Test Plan', [t1, t2, t3, t4]);
      const layers = plan.getExecutionLayers();

      expect(layers).toHaveLength(3);
      expect(layers[0]).toContain(t1);
      expect(layers[0]).toContain(t2);
      expect(layers[1]).toContain(t3);
      expect(layers[2]).toContain(t4);
    });

    it('should handle cycle detection by falling back to sequential execution for remaining tasks', () => {
      const t1 = new Task('1', 'm1', 'd1', 's1', undefined, undefined, ['2']);
      const t2 = new Task('2', 'm2', 'd2', 's2', undefined, undefined, ['1']);

      const plan = new Plan('Cycle Plan', [t1, t2]);
      const layers = plan.getExecutionLayers();

      // Since none can start (both have dependencies not met), it hits line 60
      expect(layers).toHaveLength(1);
      expect(layers[0]).toEqual([t1, t2]);
    });

    it('should return empty layers for empty plan', () => {
      const plan = new Plan('Empty');
      expect(plan.getExecutionLayers()).toHaveLength(0);
    });
  });
});
