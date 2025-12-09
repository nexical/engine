import { spawnSync } from 'child_process';
import type { Orchestrator } from '../orchestrator.js';

export class GitService {
    constructor(private core: Orchestrator) { }

    runCommand(args: string[], cwd?: string): string {
        const result = spawnSync('git', args, {
            cwd: cwd || this.core.config.projectPath,
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
        if (this.core.identityManager && this.core.jobContext) {
            try {
                const { teamId, projectId, jobId, mode } = this.core.jobContext;
                const token = await this.core.identityManager.getGitToken(teamId, projectId, jobId, mode);
                if (token) {
                    // Inject token into URL: https://<token>@github.com/...
                    // Assuming URL is https. If ssh, we need different handling.
                    if (url.startsWith('https://')) {
                        authUrl = url.replace('https://', `https://${token}@`);
                    }
                }
            } catch (error) {
                console.error('Failed to get git token:', error);
                // Proceed with original URL (public repo?) or fail later
            }
        }

        const args = ['clone', authUrl];
        if (dir) {
            args.push(dir);
        }
        // Clone runs in the parent directory of the project path usually, or current cwd
        // But here we probably want to run it in the current working directory of the process
        // if we are initializing a new project.
        // use projectPath which is the sandbox root or the project root.
        this.runCommand(args, this.core.config.projectPath);
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
}
