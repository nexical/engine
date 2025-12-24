import { spawn, SpawnOptions, spawnSync } from 'child_process';

import { IRuntimeHost } from '../domain/RuntimeHost.js';

export interface IShellResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export interface IShellOptions extends SpawnOptions {
  streamStdio?: boolean;
}

export class ShellExecutor {
  constructor(private host: IRuntimeHost) {}

  async execute(command: string, args: string[] = [], options: IShellOptions = {}): Promise<IShellResult> {
    return new Promise((resolve, reject) => {
      const sanitizedOptions = this.sanitizeEnv(options);
      const log = (msg: string): void => {
        this.host.log('debug', msg);
      };

      this.host.log('debug', `Executing: ${command} ${args.join(' ')}`);

      const spawnOptions: SpawnOptions = {
        ...sanitizedOptions,
        stdio: sanitizedOptions.streamStdio ? ['inherit', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
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

  executeSync(command: string, args: string[] = [], options: SpawnOptions = {}): IShellResult {
    const sanitizedOptions = this.sanitizeEnv(options);
    const result = spawnSync(command, args, {
      encoding: 'utf-8',
      ...sanitizedOptions,
    });

    if (result.error) {
      throw result.error;
    }

    return {
      stdout: result.stdout ? result.stdout.toString() : '',
      stderr: result.stderr ? result.stderr.toString() : '',
      code: result.status,
    };
  }

  private sanitizeEnv<T extends SpawnOptions>(options: T): T {
    const env = options.env || process.env;
    const sanitizedEnv = { ...env };

    // Remove Git-related variables that might interfere when running in a hook
    const keysToRemove = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX'];
    for (const key of keysToRemove) {
      delete sanitizedEnv[key];
    }

    return {
      ...options,
      env: sanitizedEnv,
    };
  }
}
