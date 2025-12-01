import { BasePlugin, CommandPlugin } from '../../models/Plugins.js';
import path from 'path';

export class InitCommandPlugin extends BasePlugin implements CommandPlugin {
    name = 'init';
    description = 'Initialize a new project. Usage: /init <github org/repo> [<directory>]';

    async execute(args: string[]): Promise<void> {
        if (!args || args.length < 1) {
            console.error('Usage: /init <github org/repo> [<directory>]');
            return;
        }

        const repoIdentifier = args[0];
        const directory = args[1] || '.';
        const targetPath = path.resolve(this.core.config.projectPath, directory);

        // Check if directory exists and is not empty
        if (directory !== '.' && this.core.disk.exists(targetPath)) {
            // Simple check for emptiness could be added to FS service, but for now we assume if it exists we might fail
            // or we let git clone fail if not empty.
        }

        const [org, repo] = repoIdentifier.split('/');
        if (!org || !repo) {
            console.error('Invalid GitHub repository format. Use <org>/<repo>');
            return;
        }

        // Check if repo exists
        let repoData = await this.core.github.getRepo(org, repo);

        if (!repoData) {
            // Create repo
            repoData = await this.core.github.createRepo(repo, org);
        }

        const repoUrl = repoData.clone_url; // or ssh_url depending on preference, usually https with token or ssh

        if (directory === '.') {
            // Init in current directory
            this.core.git.init();
            this.core.git.addRemote('origin', repoUrl);
            // If repo is new/empty, we might need to do initial commit? 
            // The prompt says "If a Git repository URL is not provided then a local Git repository is initialized..."
            // But here we always have a repo URL (either existing or created).
            // If we created it, it might be empty or have README.
            // If we cloned it, we have content.

            // Wait, if we are in '.', we can't clone into '.' if it's not empty.
            // So we init and pull? Or just init and add remote.
        } else {
            this.core.git.clone(repoUrl, directory);
        }

        // Ensure .nexical directory and config files
        const nexicalDir = path.join(targetPath, '.nexical');
        const agentsDir = path.join(nexicalDir, 'agents');

        await this.core.disk.ensureDir(agentsDir);

        const capabilitiesFile = path.join(agentsDir, 'capabilities.yml');
        if (!this.core.disk.exists(capabilitiesFile)) {
            await this.core.disk.writeFile(capabilitiesFile, '# Agent capabilities\n');
        }

        const configFile = path.join(nexicalDir, 'config.yml');
        if (!this.core.disk.exists(configFile)) {
            await this.core.disk.writeFile(configFile, '# Nexical configuration\nproject_name: ' + repo + '\n');
        }

        console.log(`Initialized project in ${directory} linked to ${repoIdentifier}`);
    }
}
