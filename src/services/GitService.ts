import { IRuntimeHost } from '../domain/RuntimeHost.js';
import { ShellService } from './ShellService.js';

export interface IGitService {
  clone(repoUrl: string, destination: string, branch?: string): Promise<void>;
  checkout(branch: string, create?: boolean): void;
  pull(remote?: string, branch?: string): void;
  status(): string;
  init(cwd?: string): void;
}

export class GitService implements IGitService {
  private shell: ShellService;

  constructor(
    private host: IRuntimeHost,
    private rootDirectory: string,
  ) {
    this.shell = new ShellService(host);
  }

  runCommand(args: string[], cwd?: string): string {
    const finalCwd = cwd || this.rootDirectory;
    this.host.log('debug', `[DEBUG GitService] Executing: git ${args.join(' ')} in ${finalCwd}`);
    const result = this.shell.executeSync('git', args, {
      cwd: finalCwd,
    });

    if (result.code !== 0) {
      throw new Error(`Git command failed: git ${args.join(' ')}\n${result.stderr}`);
    }

    return result.stdout.trim();
  }

  init(cwd?: string): void {
    this.runCommand(['init'], cwd);
  }

  async clone(url: string, dir?: string): Promise<void> {
    const authUrl = url;
    const args = ['clone', authUrl];
    if (dir) {
      args.push(dir);
    }
    this.runCommand(args, this.rootDirectory);
    await Promise.resolve();
  }

  addRemote(name: string, url: string): void {
    this.runCommand(['remote', 'add', name, url]);
  }

  checkout(branch: string, create: boolean = false): void {
    const args = ['checkout'];
    if (create) {
      args.push('-b');
    }
    args.push(branch);
    this.runCommand(args);
  }

  merge(branch: string): void {
    this.runCommand(['merge', branch]);
  }

  pull(remote: string = 'origin', branch: string = 'main'): void {
    this.runCommand(['pull', remote, branch]);
  }

  add(files: string | string[], cwd?: string): void {
    const fileList = Array.isArray(files) ? files : [files];
    this.runCommand(['add', ...fileList], cwd);
  }

  commit(message: string, cwd?: string): void {
    this.runCommand(['commit', '-m', message], cwd);
  }

  push(remote: string = 'origin', branch: string = 'main', cwd?: string): void {
    this.runCommand(['push', remote, branch], cwd);
  }

  status(): string {
    return this.runCommand(['status', '--porcelain']);
  }

  getCurrentBranch(): string {
    return this.runCommand(['rev-parse', '--abbrev-ref', 'HEAD']);
  }

  deleteBranch(branch: string, force: boolean = false): void {
    const args = ['branch', force ? '-D' : '-d', branch];
    this.runCommand(args);
  }

  pushDelete(remote: string, branch: string): void {
    this.runCommand(['push', remote, '--delete', branch]);
  }

  worktreeAdd(path: string, branch: string, base?: string): void {
    const args = ['worktree', 'add', '-f'];

    if (base) {
      // Create new branch from base: git worktree add -f -b <branch> <path> <base>
      args.push('-b', branch, path, base);
    } else {
      // Checkout existing branch: git worktree add -f <path> <branch>
      args.push(path, branch);
    }

    this.runCommand(args);
  }

  worktreeRemove(path: string): void {
    this.runCommand(['worktree', 'remove', '-f', path]);
  }

  worktreePrune(): void {
    this.runCommand(['worktree', 'prune']);
  }

  mergeBase(branch1: string, branch2: string): string {
    return this.runCommand(['merge-base', branch1, branch2]);
  }

  sparseCheckoutInit(path: string): void {
    this.runCommand(['sparse-checkout', 'init', '--cone'], path);
  }

  sparseCheckoutSet(path: string, paths: string[]): void {
    this.runCommand(['sparse-checkout', 'set', ...paths], path);
  }

  cleanStaleWorktrees(): void {
    this.runCommand(['worktree', 'prune']);
    // We might want more aggressive cleanup here, e.g. finding directories in .worktrees/ that are not valid worktrees?
    // For now, 'git worktree prune' helps if the git metadata believes they are gone.
    // However, if the process crashed, the directory still exists.
    // Real GC would involve FS operations to remove .worktrees/* if not locked.
    // But per instructions: "Startup 'Garbage Collection' routine should check for and prune stale worktrees."
    // Prune is the git command.
  }

  submoduleInit(path: string): void {
    this.runCommand(['submodule', 'init'], path);
  }

  submoduleUpdate(path: string): void {
    this.runCommand(['submodule', 'update', '--init', '--recursive'], path);
  }
}
