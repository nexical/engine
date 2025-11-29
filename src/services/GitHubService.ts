import debug from 'debug';
import { Orchestrator } from '../orchestrator.js';

const log = debug('github');

export class GitHubService {
    private apiKey: string | undefined;
    private organization: string | undefined;

    constructor(private core: Orchestrator) {
        // We'll load these from the config/env later, but for now we expect them to be available
        // when the service is used.
    }

    private getHeaders() {
        this.apiKey = process.env.GITHUB_API_KEY;
        if (!this.apiKey) {
            throw new Error("GitHub API key is not configured. Run /github <org> <key> to configure.");
        }
        return {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        };
    }

    async getUser(): Promise<any> {
        log('Getting authenticated user info...');
        const response = await fetch('https://api.github.com/user', {
            headers: this.getHeaders()
        });

        if (!response.ok) {
            throw new Error(`Failed to get user: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    }

    async getRepo(owner: string, repo: string): Promise<any> {
        log(`Checking if repo ${owner}/${repo} exists...`);
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
            headers: this.getHeaders()
        });

        if (response.status === 404) {
            return null;
        }

        if (!response.ok) {
            throw new Error(`Failed to get repo: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    }

    async createRepo(name: string, org?: string): Promise<any> {
        log(`Creating repo ${name} in ${org || 'user account'}...`);
        
        const url = org 
            ? `https://api.github.com/orgs/${org}/repos`
            : 'https://api.github.com/user/repos';

        const response = await fetch(url, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({
                name,
                private: true, // Default to private
                auto_init: true // Initialize with README
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Failed to create repo: ${response.status} ${response.statusText} - ${errorBody}`);
        }

        const data = await response.json();
        log(`Successfully created repo ${data.full_name}`);
        return data;
    }
}
