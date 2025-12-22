import yaml from 'js-yaml';
import { FileSystemService } from '../services/FileSystemService.js';

export class ProjectProfile {
    [key: string]: any;

    static load(path: string): ProjectProfile {
        const disk = new FileSystemService();
        if (!disk.exists(path)) {
            return new ProjectProfile();
        }

        try {
            const content = disk.readFile(path);
            return ProjectProfile.fromYaml(content);
        } catch (e) {
            console.error(`Failed to load project profile from ${path}:`, e);
            throw e;
        }
    }

    static fromYaml(content: string): ProjectProfile {
        const data = yaml.load(content) as any;
        const profile = new ProjectProfile();
        Object.assign(profile, data);
        return profile;
    }
}
