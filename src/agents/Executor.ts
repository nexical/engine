import path from 'path';

import { IProject } from '../domain/Project.js';
import { IRuntimeHost } from '../domain/RuntimeHost.js';
import { EngineState } from '../domain/State.js';
import { Task } from '../domain/Task.js';
import { IWorkspace } from '../domain/Workspace.js';
import { SignalDetectedError } from '../errors/SignalDetectedError.js';
import { GitService } from '../services/GitService.js';
import { ISkillRunner } from '../services/SkillRunner.js';

export class Executor {
  public readonly name = 'Executor';
  public readonly description = 'Executes the implementation plan by running skills.';

  constructor(
    private project: IProject,
    private workspace: IWorkspace,
    private skillRunner: ISkillRunner,
    private host: IRuntimeHost,
    private git?: GitService,
  ) {
    if (this.git) {
      try {
        this.git.cleanStaleWorktrees();
      } catch (e) {
        // Warning only, as we might be in a fresh/non-git env
        const msg = e instanceof Error ? e.message : String(e);
        this.host.log('warn', `Failed to clean stale worktrees: ${msg}`);
      }
    }
  }

  async execute(state: EngineState): Promise<void> {
    const prompt = state.user_prompt;

    // Load Plan using Workspace
    const plan = await this.workspace.loadPlan();
    this.host.log('info', `Executing plan: ${plan.plan_name} with ${plan.tasks.length} tasks.`);

    // Sync pending tasks (legacy support for state tracking, though we use layers now)
    state.tasks.pending = plan.tasks.map((t) => t.id).filter((id) => !state.tasks.completed.includes(id));

    // Get execution layers (topological sort)
    const layers = plan.getExecutionLayers();
    this.host.log('debug', `[DEBUG] Plan execution layers: ${layers.length}`);

    if (layers.flat().every((t) => state.tasks.completed.includes(t.id))) {
      this.host.log('info', 'All tasks in plan are already completed.');
      return;
    }

    // Execute layers
    for (const layer of layers) {
      // Filter out tasks in this layer that are already complete
      const pendingTasks = layer.filter((t) => !state.tasks.completed.includes(t.id));

      if (pendingTasks.length === 0) {
        continue;
      }

      await this.executeLayer(pendingTasks, prompt, state);
    }
  }

  private async executeLayer(tasks: Task[], userPrompt: string, state: EngineState): Promise<void> {
    if (tasks.length === 0) return;

    // Universal Worktree Execution: All layers, even single tasks, run in isolation.
    await this.executeParallelLayer(tasks, userPrompt, state);
  }

  private async executeParallelLayer(tasks: Task[], userPrompt: string, state: EngineState): Promise<void> {
    this.host.log('info', `Starting execution layer with ${tasks.length} tasks: ${tasks.map((t) => t.id).join(', ')}`);

    if (!this.git) {
      throw new Error('Git is required for isolated execution.');
    }

    const worktreesBaseDir = path.join(this.project.paths.root, '.worktrees');
    const activeWorktrees: { path: string; branch: string }[] = [];
    // Use current branch as base for new worktrees
    const baseBranch = this.git.getCurrentBranch();

    try {
      const promises = tasks.map(async (task) => {
        const branchName = `task/${task.id}`;
        const worktreePath = path.join(worktreesBaseDir, task.id);

        // Track for cleanup
        activeWorktrees.push({ path: worktreePath, branch: branchName });

        try {
          this.host.log('debug', `Setting up isolation for task ${task.id}`);

          // 1. Create Worktree (Create new branch from current)
          this.git!.worktreeAdd(worktreePath, branchName, baseBranch);

          // 1.5 Submodule Initialization (if globally enabled)
          if (this.project.getConfig().git?.submodules) {
            this.host.log('debug', `Updating submodules for task ${task.id}`);
            this.git!.submoduleUpdate(worktreePath);
          }

          // Get Skill Config
          const skillDef = this.skillRunner.getSkills().find((s) => s.name === task.skill);

          // 2. Sparse Checkout (Hydration A)
          if (skillDef?.sparse_checkout && Array.isArray(skillDef.sparse_checkout)) {
            this.host.log('debug', `Initializing sparse checkout for task ${task.id}`);
            this.git!.sparseCheckoutInit(worktreePath);
            this.git!.sparseCheckoutSet(worktreePath, skillDef.sparse_checkout);
          }

          // 3. Hydration (Copy files/Artifact Injection) (Hydration B)
          const { execSync } = await import('child_process');
          if (skillDef?.hydration && Array.isArray(skillDef.hydration)) {
            for (const item of skillDef.hydration) {
              const source = path.join(this.project.paths.root, item);
              const target = path.join(worktreePath, item);
              // Ensure parent dir exists
              execSync(`mkdir -p "${path.dirname(target)}"`);
              // Copy (-r for recursive, -p for preserve mode/timestamps if possible, but basic cp is safer across generic unix)
              execSync(`cp -r "${source}" "${target}"`);
            }
          }

          // 4. Setup Commands (Hydration C)
          if (skillDef?.worktree_setup && Array.isArray(skillDef.worktree_setup)) {
            for (const cmd of skillDef.worktree_setup) {
              execSync(cmd, { cwd: worktreePath });
            }
          }

          // 5. Copy .ai directory (Always)
          const aiDir = path.join(this.project.paths.root, '.ai');
          const aiTarget = path.join(worktreePath, '.ai');
          execSync(`cp -r "${aiDir}" "${aiTarget}"`);

          // 6. Run Skill
          const prompt = task.description || task.message || userPrompt;
          await this.skillRunner.runSkill(task, prompt, worktreePath);

          // 7. Check Signal
          const signal = await this.workspace.detectSignal(path.join(worktreePath, '.ai/signals'));
          if (signal) {
            throw new SignalDetectedError(signal, task.id);
          }

          // 8. Commit
          this.git!.add('.', worktreePath);
          this.git!.commit(`[nexical] Task complete: ${task.id}`, worktreePath);

          state.completeTask(task.id);
          this.host.log('info', `Task ${task.id} completed.`);

          return { taskId: task.id, branch: branchName, worktreePath };
        } catch (e) {
          state.tasks.failed.push(task.id);
          this.host.log('error', `Task ${task.id} failed: ${e instanceof Error ? e.message : String(e)}`);
          throw e; // Fail fast
        }
      });

      const results = await Promise.all(promises);

      // Merge Back Phase
      const currentBranch = this.git.getCurrentBranch();
      for (const res of results) {
        this.host.log('info', `Merging ${res.branch} into ${currentBranch}`);
        try {
          this.git.merge(res.branch);
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          this.host.log('error', `Merge failed for task ${res.taskId} from branch ${res.branch}: ${errMsg}`);
          throw new Error(`Merge conflict detected for task ${res.taskId}. Manual resolution required.`);
        }
      }
    } finally {
      // Cleanup Phase (Resilience)
      this.host.log('info', `Cleaning up ${activeWorktrees.length} worktrees...`);
      for (const wt of activeWorktrees) {
        try {
          this.git.worktreeRemove(wt.path);
          this.git.deleteBranch(wt.branch, true);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          this.host.log('warn', `Failed to cleanup worktree ${wt.path}: ${msg}`);
        }
      }

      // Always prune stale worktrees
      try {
        this.git.worktreePrune();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.host.log('warn', `Failed to prune worktrees: ${msg}`);
      }
    }
  }

  private async checkSignals(taskId: string): Promise<void> {
    const signal = await this.workspace.detectSignal();
    if (signal) {
      this.host.log('info', `Signal detected after task ${taskId}: ${signal.type}`);
      throw new SignalDetectedError(signal, taskId);
    }
  }
}
