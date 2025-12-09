import { ShellExecutor } from '../utils/shell.js';
import { Capabilities } from '../models/Skill.js';
import debug from 'debug';

const log = debug('capability-service');

export class CapabilityService {

    async getCapabilities(): Promise<Capabilities> {
        const binariesToCheck = ['terraform', 'docker', 'node', 'npm', 'git', 'python3', 'pip', 'gh'];
        const binaries: Record<string, boolean> = {};

        for (const bin of binariesToCheck) {
            try {
                await ShellExecutor.execute('which', [bin]);
                binaries[bin] = true;
            } catch (e) {
                binaries[bin] = false;
            }
        }

        log('Detected capabilities:', binaries);
        return { binaries };
    }
}
