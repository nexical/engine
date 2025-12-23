import { IRuntimeHost } from '../domain/RuntimeHost.js';
import { ShellExecutor } from '../utils/shell.js';

export class GitService {
  private shell: ShellExecutor;

  constructor(
    private host: IRuntimeHost,
    private rootDirectory: string,
  ) {
    this.shell = new ShellExecutor(this.host);
  }

  runCommand(args: string[], cwd?: string): string {
    const result = this.shell.executeSync('git', args, {
      cwd: cwd || this.rootDirectory,
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

  add(files: string | string[]): void {
    const fileList = Array.isArray(files) ? files : [files];
    this.runCommand(['add', ...fileList]);
  }

  commit(message: string): void {
    this.runCommand(['commit', '-m', message]);
  }

  push(remote: string = 'origin', branch: string = 'main'): void {
    this.runCommand(['push', remote, branch]);
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
}
