import { spawnSync } from 'child_process';
import type { Orchestrator } from '../orchestrator.js';

export class GitService {
    constructor(private core: Orchestrator) { }

    runCommand(args: string[], cwd?: string): string {
        const result = spawnSync('git', args, {
            cwd: cwd || this.core.project.rootDirectory,
            encoding: 'utf-8',
        });

        if (result.status !== 0) {
            throw new Error(`Git command failed: git ${args.join(' ')}\n${result.stderr}`);
        }

        return result.stdout.trim();
    }

    init(cwd?: string): void {
        this.runCommand(['init'], cwd);
    }

    async clone(url: string, dir?: string): Promise<void> {
        let authUrl = url;
        // Token injection removed - rely on system git credentials or environment variables

        const args = ['clone', authUrl];
        if (dir) {
            args.push(dir);
        }
        // Clone runs in the parent directory of the project path usually, or current cwd
        // But here we probably want to run it in the current working directory of the process
        // if we are initializing a new project.
        // use workingDirectory which is the sandbox root or the project root.
        this.runCommand(args, this.core.project.rootDirectory);
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
