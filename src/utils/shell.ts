import debug from 'debug';
import { spawn, spawnSync, SpawnOptions } from 'child_process';

const log = debug('shell-executor');

export interface ShellResult {
    stdout: string;
    stderr: string;
    code: number | null;
}

export interface ShellOptions extends SpawnOptions {
    streamStdio?: boolean;
}

export class ShellExecutor {

    static execute(command: string, args: string[] = [], options: ShellOptions = {}): Promise<ShellResult> {
        return new Promise((resolve, reject) => {
            log(`Executing: ${command} ${args.join(' ')}`);

            const spawnOptions: SpawnOptions = {
                ...options,
                stdio: options.streamStdio ? ['inherit', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe']
            };

            const child = spawn(command, args, spawnOptions);

            let stdout = '';
            let stderr = '';

            if (child.stdout) {
                child.stdout.on('data', (data: Buffer) => {
                    const chunk = data.toString();
                    stdout += chunk;
                    if (options.streamStdio) {
                        process.stdout.write(chunk);
                    }
                });
            }

            if (child.stderr) {
                child.stderr.on('data', (data: Buffer) => {
                    const chunk = data.toString();
                    stderr += chunk;
                    if (options.streamStdio) {
                        process.stderr.write(chunk);
                    }
                });
            }

            child.on('close', (code: number) => {
                log(`Command exited with code ${code}`);
                resolve({ stdout, stderr, code });
            });

            child.on('error', (err: Error) => {
                log(`Command failed: ${err.message}`);
                reject(err);
            });
        });
    }

    static executeSync(command: string, args: string[] = [], options: SpawnOptions = {}): ShellResult {
        log(`Executing sync: ${command} ${args.join(' ')}`);
        const result = spawnSync(command, args, {
            encoding: 'utf-8',
            ...options
        });

        if (result.error) {
            throw result.error;
        }

        return {
            stdout: result.stdout ? result.stdout.toString() : '',
            stderr: result.stderr ? result.stderr.toString() : '',
            code: result.status
        };
    }
}
