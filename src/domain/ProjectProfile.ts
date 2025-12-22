import yaml from 'js-yaml';
import fs from 'fs';

export class ProjectProfile {
    [key: string]: any;

    static load(path: string): ProjectProfile {
        if (!fs.existsSync(path)) {
            return new ProjectProfile();
        }

        try {
            const content = fs.readFileSync(path, 'utf8');
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
