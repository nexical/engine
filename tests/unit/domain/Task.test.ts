import { Task } from '../../../src/domain/Task.js';

describe('Task', () => {
  it('should create task from data', () => {
    const data = {
      description: 'desc',
      message: 'msg',
      skill: 'skill',
    };
    const task = Task.fromData(data);
    expect(task.id).toBeDefined();
    expect(task.id).toMatch(/^task-/);
    expect(task.description).toBe('desc');
    expect(task.message).toBe('msg');
    expect(task.skill).toBe('skill');
  });

  it('should accept existing id', () => {
    const data = {
      id: 'existing-id',
      description: 'desc',
      message: 'msg',
      skill: 'skill',
    };
    const task = Task.fromData(data);
    expect(task.id).toBe('existing-id');
  });

  it('should handle optional fields', () => {
    const data = {
      description: 'desc',
      message: 'msg',
      skill: 'skill',
      persona: 'persona',
      dependencies: ['dep1'],
      params: { p1: 'v1' },
    };
    const task = Task.fromData(data);
    expect(task.persona).toBe('persona');
    expect(task.dependencies).toEqual(['dep1']);
    expect(task.params).toEqual({ p1: 'v1' });
  });
});
