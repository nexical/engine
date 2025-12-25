import { execSync } from 'child_process';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { IProject } from '../domain/Project.js';
import { IRuntimeHost } from '../domain/RuntimeHost.js';
import { ISkillContext } from '../domain/SkillConfig.js';
import { EngineState } from '../domain/State.js';
import { Task } from '../domain/Task.js';
import { IWorkspace } from '../domain/Workspace.js';
import { DriverRegistry } from '../drivers/DriverRegistry.js';
import { SignalDetectedError } from '../errors/SignalDetectedError.js';
import { FileSystemBus } from '../services/FileSystemBus.js';
import { GitService } from '../services/GitService.js';
import { IPromptEngine } from '../services/PromptEngine.js';
import { ISkillRegistry } from '../services/SkillRegistry.js';
import { Signal } from '../workflow/Signal.js';

export class Executor {
  public readonly name = 'Executor';
  public readonly description = 'Executes the implementation plan by running skills.';

  constructor(
    private project: IProject,
    private workspace: IWorkspace,
    private skillRegistry: ISkillRegistry,
    private driverRegistry: DriverRegistry,
    private host: IRuntimeHost,
    private git: GitService,
    private bus: FileSystemBus,
    private promptEngine: IPromptEngine,
  ) {
    if (this.git) {
      try {
        this.git.cleanStaleWorktrees();
      } catch (e) {
        // Warning only
        const msg = e instanceof Error ? e.message : String(e);
        this.host.log('warn', `Failed to clean stale worktrees: ${msg}`);
      }
    }
  }

  async execute(state: EngineState): Promise<void> {
    const prompt = state.user_prompt;

    const plan = await this.workspace.loadPlan();
    this.host.log('info', `Executing plan: ${plan.plan_name} with ${plan.tasks.length} tasks.`);

    state.tasks.pending = plan.tasks.map((t) => t.id).filter((id) => !state.tasks.completed.includes(id));

    const layers = plan.getExecutionLayers();
    this.host.log('debug', `[DEBUG] Plan execution layers: ${layers.length}`);

    if (layers.flat().every((t) => state.tasks.completed.includes(t.id))) {
      this.host.log('info', 'All tasks in plan are already completed.');
      return;
    }

    for (const layer of layers) {
      const pendingTasks = layer.filter((t) => !state.tasks.completed.includes(t.id));

      if (pendingTasks.length === 0) {
        continue;
      }

      await this.executeLayer(pendingTasks, prompt, state);
    }
  }

  private async executeLayer(tasks: Task[], userPrompt: string, state: EngineState): Promise<void> {
    await this.executeParallelLayer(tasks, userPrompt, state);
  }

  private async executeParallelLayer(tasks: Task[], userPrompt: string, state: EngineState): Promise<void> {
    this.host.log('info', `Starting execution layer with ${tasks.length} tasks: ${tasks.map((t) => t.id).join(', ')}`);

    if (!this.git) {
      throw new Error('Git is required for isolated execution.');
    }

    const worktreesBaseDir = path.join(this.project.paths.root, '.worktrees');
    const activeWorktrees: { path: string; branch: string }[] = [];
    const baseBranch = this.git.getCurrentBranch();

    try {
      const promises = tasks.map(async (task) => {
        const branchName = `task/${task.id}`;
        const worktreePath = path.join(worktreesBaseDir, task.id);

        activeWorktrees.push({ path: worktreePath, branch: branchName });

        try {
          this.host.log('debug', `Setting up isolation for task ${task.id}`);

          // 1. Create Worktree
          this.git.worktreeAdd(worktreePath, branchName, baseBranch);

          // 1.5 Submodule Initialization
          if (this.project.getConfig().git?.submodules) {
            this.host.log('debug', `Updating submodules for task ${task.id}`);
            this.git.submoduleUpdate(worktreePath);
          }

          // Get Skill
          const skill = this.skillRegistry.getSkill(task.skill);
          if (!skill) {
            throw new Error(`Skill '${task.skill}' not found in registry.`);
          }
          const skillDef = skill.getEnvironmentSpec();

          // 2. Sparse Checkout
          if (skillDef?.sparse_checkout && Array.isArray(skillDef.sparse_checkout)) {
            this.host.log('debug', `Initializing sparse checkout for task ${task.id}`);
            this.git.sparseCheckoutInit(worktreePath);
            this.git.sparseCheckoutSet(worktreePath, skillDef.sparse_checkout);
          }

          // 3. Hydration
          if (skillDef?.hydration && Array.isArray(skillDef.hydration)) {
            for (const item of skillDef.hydration) {
              const source = path.join(this.project.paths.root, item);
              const target = path.join(worktreePath, item);
              execSync(`mkdir -p "${path.dirname(target)}"`);
              execSync(`cp -r "${source}" "${target}"`);
            }
          }

          // 4. Setup Commands
          if (skillDef?.worktree_setup && Array.isArray(skillDef.worktree_setup)) {
            for (const cmd of skillDef.worktree_setup) {
              execSync(cmd, { cwd: worktreePath });
            }
          }

          // 5. Copy .ai directory
          const aiDir = path.join(this.project.paths.root, '.ai');
          const aiTarget = path.join(worktreePath, '.ai');
          execSync(`cp -r "${aiDir}" "${aiTarget}"`);

          // 6. Run Skill
          const context: ISkillContext = {
            taskId: task.id,
            logger: this.host,
            fileSystem: this.project.fileSystem,
            driverRegistry: this.driverRegistry,
            workspaceRoot: worktreePath,
            params: {
              ...this.project.getConfig(),
              task_id: task.id,
              task_description: task.description,
            },
            userPrompt: task.description || task.message || userPrompt,
            promptEngine: this.promptEngine,

            commandRunner: async (cmd: string, args: string[] = []) => {
              const fullCmd = `${cmd} ${args.join(' ')}`;
              const out = execSync(fullCmd, { cwd: worktreePath, encoding: 'utf-8' });
              return Promise.resolve(out);
            },

            clarificationHandler: async (question: string) => {
              const corrId = uuidv4();
              this.bus.sendRequest({
                id: uuidv4(),
                correlationId: corrId,
                source: `task-${task.id}`,
                type: 'request',
                payload: Signal.clarificationNeeded([question]),
              });
              const resp = await this.bus.waitForResponse(corrId);
              const data = resp.payload as { answers: Record<string, string> };
              return data?.answers?.[question] || '';
            },

            validators: [],
          };

          const result = await skill.execute(context);
          if (result.isFail()) {
            throw result.error() || new Error('Skill execution failed');
          }

          // 7. Check workspace signals
          const signal = await this.workspace.detectSignal(path.join(worktreePath, '.ai/signals'));
          if (signal) {
            throw new SignalDetectedError(signal, task.id);
          }

          // 8. Commit
          this.git.runCommand(['add', '--sparse', '.'], worktreePath);
          this.git.commit(`[nexical] Task complete: ${task.id}`, worktreePath);

          state.completeTask(task.id);
          this.host.log('info', `Task ${task.id} completed.`);

          return { taskId: task.id, branch: branchName, worktreePath };
        } catch (e) {
          state.tasks.failed.push(task.id);
          this.host.log('error', `Task ${task.id} failed: ${e instanceof Error ? e.message : String(e)}`);
          throw e;
        }
      });

      const results = await Promise.all(promises);

      // Merge Back Phase
      const currentBranch = this.git.getCurrentBranch();

      // Stash local changes (including new files) to avoid merge conflicts
      let stashed = false;
      try {
        const stashOut = this.git.runCommand(['stash', 'push', '-u', '-m', 'Executor-Auto-Stash']);
        stashed = !stashOut.includes('No local changes to save');
      } catch (e) {
        this.host.log('warn', `Failed to stash changes: ${e instanceof Error ? e.message : String(e)}`);
      }

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

      // Restore stashed changes
      if (stashed) {
        try {
          this.git.runCommand(['stash', 'pop']);
        } catch (e) {
          // Pop conflict is possible if merged content differs from stashed.
          // But since task branch contains the stashed content (copied), it should be fine mostly.
          // If conflict occurs, it's a real conflict.
          this.host.log('warn', `Stash pop failed (conflict?): ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } finally {
      // Cleanup Phase
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

      try {
        this.git.worktreePrune();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.host.log('warn', `Failed to prune worktrees: ${msg}`);
      }
    }
  }
}
