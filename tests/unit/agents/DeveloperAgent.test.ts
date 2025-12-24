import { jest } from '@jest/globals';

const mockExecSync = jest.fn();
jest.unstable_mockModule('child_process', () => ({
  execSync: mockExecSync,
}));

import { DeveloperAgent } from '../../../src/agents/DeveloperAgent.js';
import { Plan } from '../../../src/domain/Plan.js';
import { IProject } from '../../../src/domain/Project.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { EngineState } from '../../../src/domain/State.js';
import { Task } from '../../../src/domain/Task.js';
import { IWorkspace } from '../../../src/domain/Workspace.js';
import { SignalDetectedError } from '../../../src/errors/SignalDetectedError.js';
import { GitService } from '../../../src/services/GitService.js';
import { ISkillRunner } from '../../../src/services/SkillRunner.js';
import { Signal, SignalType } from '../../../src/workflow/Signal.js';

describe('DeveloperAgent', () => {
  let agent: DeveloperAgent;
  let mockProject: jest.Mocked<IProject>;
  let mockWorkspace: jest.Mocked<IWorkspace>;
  let mockSkillRunner: jest.Mocked<ISkillRunner>;
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockGit: jest.Mocked<GitService>;
  let state: EngineState;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecSync.mockReset();

    mockProject = {
      paths: { root: '/tmp', signals: '/tmp/signals' },
      getConfig: jest.fn().mockReturnValue({}),
      getConstraints: jest.fn().mockReturnValue('constraints'),
    } as unknown as jest.Mocked<IProject>;
    mockWorkspace = {
      loadPlan: jest.fn(),
      detectSignal: jest.fn<() => Promise<Signal | null>>().mockResolvedValue(null),
    } as unknown as jest.Mocked<IWorkspace>;
    mockSkillRunner = {
      runSkill: jest.fn(),
      getSkills: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<ISkillRunner>;
    mockHost = {
      log: jest.fn(),
      status: jest.fn(),
      ask: jest.fn(),
      emit: jest.fn(),
    } as unknown as jest.Mocked<IRuntimeHost>;
    mockGit = {
      add: jest.fn(),
      commit: jest.fn(),
      worktreeAdd: jest.fn(),
      worktreeRemove: jest.fn(),
      worktreePrune: jest.fn(),
      merge: jest.fn(),
      getCurrentBranch: jest.fn().mockReturnValue('main'),
      deleteBranch: jest.fn(),
      cleanStaleWorktrees: jest.fn(),
      sparseCheckoutInit: jest.fn(),
      sparseCheckoutSet: jest.fn(),
      submoduleInit: jest.fn(),
      submoduleUpdate: jest.fn(),
      mergeBase: jest.fn(),
    } as unknown as jest.Mocked<GitService>;

    state = new EngineState('test-session');
    state.initialize('prompt');

    agent = new DeveloperAgent(mockProject, mockWorkspace, mockSkillRunner, mockHost, mockGit);
  });

  it('should be defined', () => {
    expect(agent).toBeDefined();
  });

  describe('execute', () => {
    it('should execute tasks in the plan sequentially', async () => {
      const state = new EngineState('test-session');
      const plan = new Plan('test plan', [
        new Task('1', 'task 1', 'msg', 'test-skill')
      ]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);

      mockSkillRunner.getSkills.mockReturnValue([
        { name: 'test-skill', provider: 'test' },
      ]);

      await agent.execute(state);

      expect(mockGit.worktreeAdd).toHaveBeenCalledWith(
        expect.stringContaining('.worktrees/1'),
        'task/1',
        'main'
      );
      expect(mockSkillRunner.runSkill).toHaveBeenCalledWith(
        expect.objectContaining({ id: '1' }),
        'msg',
        expect.stringContaining('.worktrees/1')
      );
      expect(mockGit.commit).toHaveBeenCalled();
      expect(mockGit.merge).toHaveBeenCalledWith('task/1');
    });

    it('should execute parallel tasks using worktrees', async () => {
      const state = new EngineState('test-session');
      const plan = new Plan('test plan', [
        new Task('1', 'task 1', 'msg1', 'skill1'),
        new Task('2', 'task 2', 'msg2', 'skill2')
      ]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);

      mockSkillRunner.getSkills.mockReturnValue([
        { name: 'skill1', provider: 'test' },
        { name: 'skill2', provider: 'test' },
      ]);

      await agent.execute(state);

      // Should call worktree logic
      expect(mockGit.worktreeAdd).toHaveBeenCalledTimes(2);
      expect(mockGit.worktreeAdd).toHaveBeenCalledWith(expect.stringContaining('.worktrees/1'), 'task/1', 'main');
      expect(mockGit.worktreeAdd).toHaveBeenCalledWith(expect.stringContaining('.worktrees/2'), 'task/2', 'main');

      // Should run skills with worktree paths
      expect(mockSkillRunner.runSkill).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }), expect.anything(), expect.stringContaining('.worktrees/1'));
      expect(mockSkillRunner.runSkill).toHaveBeenCalledWith(expect.objectContaining({ id: '2' }), expect.anything(), expect.stringContaining('.worktrees/2'));

      // Should copy .ai directory
      // implementation calls: execSync(`cp -r "${aiDir}" "${aiTarget}"`) -> 1 argument
      expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('cp -r'));

      // Should merge
      expect(mockGit.merge).toHaveBeenCalledWith('task/1');
      expect(mockGit.merge).toHaveBeenCalledWith('task/2');

      // Should cleanup
      expect(mockGit.worktreeRemove).toHaveBeenCalledTimes(2);
      expect(mockGit.worktreePrune).toHaveBeenCalledTimes(1);
    });

    it('should handle parallel task failure', async () => {
      const state = new EngineState('test-session');
      const plan = new Plan('test plan', [
        new Task('1', 'task 1', 'msg1', 'skill1'),
        new Task('2', 'task 2', 'msg2', 'skill2')
      ]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);

      mockSkillRunner.getSkills.mockReturnValue([
        { name: 'skill1', provider: 'test' },
        { name: 'skill2', provider: 'test' },
      ]);

      mockSkillRunner.runSkill.mockImplementation(async (task) => {
        if (task.id === '1') throw new Error('Task 1 failed');
        return Promise.resolve();
      });

      await expect(agent.execute(state)).rejects.toThrow('Task 1 failed');
      expect(state.tasks.failed).toContain('1');

      // Should NOT merge if failed (assuming fail-fast)
      expect(mockGit.merge).not.toHaveBeenCalled();
      // Should still cleanup (finally block)
      expect(mockGit.worktreeRemove).toHaveBeenCalled();
    });

    it('should throw if git is missing for parallel execution', async () => {
      const agentNoGit = new DeveloperAgent(mockProject, mockWorkspace, mockSkillRunner, mockHost, undefined);
      const mockPlan = new Plan('test plan', [
        new Task('1', 'task 1', 'desc 1', 'skill 1'),
        new Task('2', 'task 2', 'desc 2', 'skill 2'),
      ]);
      mockWorkspace.loadPlan.mockResolvedValue(mockPlan);

      await expect(agentNoGit.execute(state)).rejects.toThrow('Git is required');
    });

    it('should run worktree setup commands', async () => {
      mockSkillRunner.getSkills.mockReturnValue([
        { name: 'skill 1', worktree_setup: ['npm install'] }
      ]);

      // It's a single task, so it runs SEQUENTIALLY by default in existing logic?
      // Wait, getExecutionLayers will return [[Task 1]]. Length=1.
      // My logic: if (tasks.length === 1) -> executeSequentialTask.
      // Sequential task DOES NOT USE WORKTREES.
      // So worktree_setup is ignored for sequential tasks?
      // The user request said: "Every sequential task uses the default branch... but when we have parallel tasks we create a git worktree".
      // So yes, worktrees are ONLY for parallel tasks.

      // Verification: Add a parallel task set to force worktree usage.
      const mockPlan2 = new Plan('test plan', [
        new Task('1', 'task 1', 'desc 1', 'skill 1'),
        new Task('2', 'task 2', 'desc 2', 'skill 2'),
      ]);
      mockWorkspace.loadPlan.mockResolvedValue(mockPlan2);
      mockSkillRunner.getSkills.mockReturnValue([
        { name: 'skill 1', worktree_setup: ['echo setup 1'] },
        { name: 'skill 2', worktree_setup: ['echo setup 2'] }
      ]);

      await agent.execute(state);

      expect(mockExecSync).toHaveBeenCalledWith('echo setup 1', expect.objectContaining({ cwd: expect.stringContaining('.worktrees/1') }));
      expect(mockExecSync).toHaveBeenCalledWith('echo setup 2', expect.objectContaining({ cwd: expect.stringContaining('.worktrees/2') }));
    });

    it('should update submodules if enabled in config', async () => {
      (mockProject.getConfig as jest.Mock).mockReturnValue({ git: { submodules: true } });
      const mockPlan = new Plan('test plan for submodules', [
        new Task('1', 'task 1', 'desc 1', 'test-skill'),
      ]);
      mockWorkspace.loadPlan.mockResolvedValue(mockPlan);

      mockSkillRunner.getSkills.mockReturnValue([
        { name: 'test-skill', provider: 'test' },
      ]);

      await agent.execute(state);
      expect(mockGit.submoduleUpdate).toHaveBeenCalledWith(expect.stringContaining('.worktrees/1'));
    });
  });
});

