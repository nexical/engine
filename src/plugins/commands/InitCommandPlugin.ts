import { BasePlugin } from '../../models/Plugins.js';
import { Orchestrator } from '../../orchestrator.js';
import { GitHubService } from '../../services/GitHubService.js';
import { GitService } from '../../services/GitService.js';
import { FileSystemService } from '../../services/FileSystemService.js';
import path from 'path';

export class InitCommandPlugin extends BasePlugin {
    private github: GitHubService;
    private git: GitService;
    private fs: FileSystemService;

    constructor(protected core: Orchestrator) {
        super(core);
        this.github = new GitHubService(core);
        this.git = new GitService(core);
        this.fs = new FileSystemService();
    }

    getName(): string {
        return 'init';
    }

    async execute(args: string[]): Promise<string> {
        if (args.length < 1) {
            throw new Error('Usage: /init <github org/repo> [<directory>]');
        }

        const repoIdentifier = args[0];
        const directory = args[1] || '.';
        const targetPath = path.resolve(this.core.config.projectPath, directory);

        // Check if directory exists and is not empty
        if (directory !== '.' && this.fs.exists(targetPath)) {
            // Simple check for emptiness could be added to FS service, but for now we assume if it exists we might fail
            // or we let git clone fail if not empty.
        }

        const [org, repo] = repoIdentifier.split('/');
        if (!org || !repo) {
            throw new Error('Invalid GitHub repository format. Use <org>/<repo>');
        }

        // Check if repo exists
        let repoData = await this.github.getRepo(org, repo);

        if (!repoData) {
            // Create repo
            repoData = await this.github.createRepo(repo, org);
        }

        const repoUrl = repoData.clone_url; // or ssh_url depending on preference, usually https with token or ssh

        if (directory === '.') {
            // Init in current directory
            this.git.init();
            this.git.addRemote('origin', repoUrl);
            // If repo is new/empty, we might need to do initial commit? 
            // The prompt says "If a Git repository URL is not provided then a local Git repository is initialized..."
            // But here we always have a repo URL (either existing or created).
            // If we created it, it might be empty or have README.
            // If we cloned it, we have content.

            // Wait, if we are in '.', we can't clone into '.' if it's not empty.
            // So we init and pull? Or just init and add remote.
        } else {
            this.git.clone(repoUrl, directory);
        }

        // Ensure .plotris directory and config files
        const plotrisDir = path.join(targetPath, '.plotris');
        const agentsDir = path.join(plotrisDir, 'agents');

        await this.fs.ensureDir(agentsDir);

        const capabilitiesFile = path.join(agentsDir, 'capabilities.yml');
        if (!this.fs.exists(capabilitiesFile)) {
            await this.fs.writeFile(capabilitiesFile, '# Agent capabilities\n');
        }

        const configFile = path.join(plotrisDir, 'config.yml');
        if (!this.fs.exists(configFile)) {
            await this.fs.writeFile(configFile, '# Plotris configuration\nproject_name: ' + repo + '\n');
        }

        return `Initialized project in ${directory} linked to ${repoIdentifier}`;
    }
}
