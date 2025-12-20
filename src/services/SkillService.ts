import { ShellExecutor } from '../utils/shell.js';
import { Skills } from '../models/Driver.js';
import debug from 'debug';

const log = debug('skill-service');

export class SkillService {

    async getSkills(): Promise<Skills> {
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

        log('Detected skills:', binaries);
        return { binaries };
    }
}
