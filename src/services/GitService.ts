import { spawnSync } from 'child_process';

export class GitService {
    constructor(private repoPath: string) { }

    runCommand(args: string[]): string {
        const result = spawnSync('git', args, {
            cwd: this.repoPath,
            encoding: 'utf-8',
        });

        if (result.status !== 0) {
            throw new Error(`Git command failed: git ${args.join(' ')}\n${result.stderr}`);
        }

        return result.stdout.trim();
    }

    commit(message: string): void {
        this.runCommand(['add', '.']);
        this.runCommand(['commit', '-m', message]);
    }

    push(remote: string = 'origin', branch: string = 'main'): void {
        this.runCommand(['push', remote, branch]);
    }

    getCurrentBranch(): string {
        return this.runCommand(['rev-parse', '--abbrev-ref', 'HEAD']);
    }
}
