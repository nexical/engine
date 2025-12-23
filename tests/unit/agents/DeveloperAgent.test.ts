import { jest } from '@jest/globals';

import { DeveloperAgent } from '../../../src/agents/DeveloperAgent.js';
import { Plan } from '../../../src/domain/Plan.js';
import { IProject } from '../../../src/domain/Project.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { EngineState } from '../../../src/domain/State.js';
import { Task } from '../../../src/domain/Task.js';
import { IWorkspace } from '../../../src/domain/Workspace.js';
import { SignalDetectedError } from '../../../src/errors/SignalDetectedError.js';
import { ISkillRunner } from '../../../src/services/SkillRunner.js';
import { Signal, SignalType } from '../../../src/workflow/Signal.js';

describe('DeveloperAgent', () => {
  let agent: DeveloperAgent;
  let mockProject: jest.Mocked<IProject>;
  let mockWorkspace: jest.Mocked<IWorkspace>;
  let mockSkillRunner: jest.Mocked<ISkillRunner>;
  let mockHost: jest.Mocked<IRuntimeHost>;
  let state: EngineState;

  beforeEach(() => {
    mockProject = {} as unknown as jest.Mocked<IProject>;
    mockWorkspace = {
      loadPlan: jest.fn(),
      detectSignal: jest.fn<() => Promise<Signal | null>>().mockResolvedValue(null),
    } as unknown as jest.Mocked<IWorkspace>;
    mockSkillRunner = {
      runSkill: jest.fn(),
    } as unknown as jest.Mocked<ISkillRunner>;
    mockHost = {
      log: jest.fn(),
      status: jest.fn(),
      ask: jest.fn(),
      emit: jest.fn(),
    } as unknown as jest.Mocked<IRuntimeHost>;

    state = new EngineState('test-session');
    state.initialize('prompt');

    agent = new DeveloperAgent(mockProject, mockWorkspace, mockSkillRunner, mockHost);
  });

  it('should be defined', () => {
    expect(agent).toBeDefined();
  });

  describe('execute', () => {
    it('should execute tasks in the plan', async () => {
      const mockPlan = new Plan('test plan', [
        new Task('1', 'task 1', 'desc 1', 'skill 1'),
        new Task('2', 'task 2', 'desc 2', 'skill 2'),
      ]);
      mockWorkspace.loadPlan.mockResolvedValue(mockPlan);

      await agent.execute(state);

      expect(mockSkillRunner.runSkill.bind(mockSkillRunner)).toHaveBeenCalledTimes(2);
      expect(state.tasks.completed).toContain('1');
      expect(state.tasks.completed).toContain('2');
    });

    it('should skip completed tasks', async () => {
      state.tasks.completed = ['1'];
      const mockPlan = new Plan('test plan', [
        new Task('1', 'task 1', 'desc 1', 'skill 1'),
        new Task('2', 'task 2', 'desc 2', 'skill 2'),
      ]);
      mockWorkspace.loadPlan.mockResolvedValue(mockPlan);

      await agent.execute(state);

      expect(mockSkillRunner.runSkill.bind(mockSkillRunner)).toHaveBeenCalledTimes(1);
      expect(state.tasks.completed).toContain('2');
    });

    it('should handle skill failure', async () => {
      const mockPlan = new Plan('test plan', [new Task('1', 'task 1', 'desc 1', 'skill 1')]);
      mockWorkspace.loadPlan.mockResolvedValue(mockPlan);
      mockSkillRunner.runSkill.mockRejectedValue(new Error('Skill failed'));

      await expect(agent.execute(state)).rejects.toThrow('Skill failed');
      expect(state.tasks.failed).toContain('1');
    });

    it('should throw SignalDetectedError if signal detected', async () => {
      const mockPlan = new Plan('test plan', [new Task('1', 'task 1', 'desc 1', 'skill 1')]);
      mockWorkspace.loadPlan.mockResolvedValue(mockPlan);
      mockWorkspace.detectSignal.mockResolvedValue(new Signal(SignalType.FAIL, 'test stop'));

      await expect(agent.execute(state)).rejects.toThrow(SignalDetectedError);
    });

    it('should respect dependencies', async () => {
      const mockPlan = new Plan('test plan', [
        new Task('2', 'task 2', 'desc 2', 'skill 2', undefined, undefined, ['1']),
      ]);
      mockWorkspace.loadPlan.mockResolvedValue(mockPlan);

      await agent.execute(state);

      expect(mockSkillRunner.runSkill.bind(mockSkillRunner)).not.toHaveBeenCalled();
      expect(mockHost.log.bind(mockHost)).toHaveBeenCalledWith('warn', expect.stringContaining('Skipping task 2'));
    });

    it('should execute task if dependencies are fulfilled', async () => {
      state.tasks.completed = ['1'];
      const mockPlan = new Plan('test plan', [
        new Task('2', 'task 2', 'desc 2', 'skill 2', undefined, undefined, ['1']),
      ]);
      mockWorkspace.loadPlan.mockResolvedValue(mockPlan);

      await agent.execute(state);

      expect(mockSkillRunner.runSkill.bind(mockSkillRunner)).toHaveBeenCalledWith(
        expect.objectContaining({ id: '2' }) as unknown,
        expect.anything(),
      );
      expect(state.tasks.completed).toContain('2');
    });

    it('should return early if all tasks are already completed', async () => {
      state.tasks.completed = ['1', '2'];
      const mockPlan = new Plan('test plan', [
        new Task('1', 'task 1', 'desc 1', 'skill 1'),
        new Task('2', 'task 2', 'desc 2', 'skill 2'),
      ]);
      mockWorkspace.loadPlan.mockResolvedValue(mockPlan);

      await agent.execute(state);

      expect(mockSkillRunner.runSkill.bind(mockSkillRunner)).not.toHaveBeenCalled();
      expect(mockHost.log.bind(mockHost)).toHaveBeenCalledWith('info', 'All tasks in plan are already completed.');
    });
  });
});
