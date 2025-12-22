import { RuntimeHost } from '../domain/RuntimeHost.js';
import { spawn, spawnSync, SpawnOptions } from 'child_process';

export interface ShellResult {
    stdout: string;
    stderr: string;
    code: number | null;
}

export interface ShellOptions extends SpawnOptions {
    streamStdio?: boolean;
}

export class ShellExecutor {
    constructor(private host: RuntimeHost) { }

    async execute(command: string, args: string[] = [], options: ShellOptions = {}): Promise<ShellResult> {
        return new Promise((resolve, reject) => {
            const log = (msg: string) => {
                this.host.log('debug', msg);
            };

            this.host.log('debug', `Executing: ${command} ${args.join(' ')}`);

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
                        this.host.log('info', chunk);
                    }
                });
            }

            if (child.stderr) {
                child.stderr.on('data', (data: Buffer) => {
                    const chunk = data.toString();
                    stderr += chunk;
                    if (options.streamStdio) {
                        this.host.log('error', chunk);
                    }
                });
            }

            child.on('close', (code: number) => {
                log(`Command exited with code ${code}`);
                resolve({ stdout, stderr, code });
            });

            child.on('error', (err: Error) => {
                const errorMsg = `Command failed: ${err.message}`;
                this.host.log('error', errorMsg);
                reject(err);
            });
        });
    }

    executeSync(command: string, args: string[] = [], options: SpawnOptions = {}): ShellResult {
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
