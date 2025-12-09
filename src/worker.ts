import { fileURLToPath } from 'url';
import { NexicalClient, NexicalWorker, Job } from '@nexical/sdk';
import { Orchestrator } from './orchestrator.js';
import { WorkspaceManager } from './services/WorkspaceManager.js';
import { JobService } from './services/JobService.js';
import { IdentityManager } from './services/IdentityManager.js';
import debug from 'debug';

const log = debug('worker');

// Configuration
const API_URL = process.env.NEXICAL_API_URL || 'https://api.nexical.cloud';
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '1', 10);
const ENROLLMENT_TOKEN = process.env.NEXICAL_ENROLLMENT_TOKEN;

export class FactoryWorker {
    private client: NexicalClient;
    private worker: NexicalWorker;
    private workspaceManager: WorkspaceManager;
    private jobService: JobService;

    constructor(
        client?: NexicalClient,
        worker?: NexicalWorker,
        workspaceManager?: WorkspaceManager,
        jobService?: JobService
    ) {
        // Initialize Services
        this.client = client || /* istanbul ignore next */ new NexicalClient({
            baseURL: API_URL, // Correct property name
        });

        this.worker = worker || /* istanbul ignore next */ new NexicalWorker(this.client, {
            concurrency: WORKER_CONCURRENCY,
            enrollmentToken: ENROLLMENT_TOKEN
        });

        this.workspaceManager = workspaceManager || /* istanbul ignore next */ new WorkspaceManager();
        this.jobService = jobService || /* istanbul ignore next */ new JobService(this.client);
    }

    async start() {
        log('Starting Nexical Factory Worker...');

        // Setup global cache (if any)
        await this.workspaceManager.setupGlobalCache();

        // Start Worker
        await this.worker.start(this.processJob.bind(this));

        // Handle Shutdown
        const shutdown = async () => {
            log('Shutting down worker...');
            await this.worker.stop();
            process.exit(0);
        };

        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
    }

    private async processJob(job: Job) {
        const jobId = job.id.toString();
        // Assume Job has teamId at runtime even if types miss it, or we rely on partial update later.
        // For now, cast to any to safe access.
        const context = job as any;
        const logJob = { id: job.id, teamId: context.teamId || 0, projectId: job.projectId };

        log(`Processing Job ${jobId} (Type: ${job.type})`);

        let workspacePath: string = '';

        try {
            // 1. Create Workspace
            workspacePath = await this.workspaceManager.createWorkspace(jobId);

            // 2. Initialize Orchestrator in Workspace
            const orchestrator = new Orchestrator({
                workingDirectory: workspacePath,
                identityManager: new IdentityManager(this.client), // Use singleton or new? new is fine.
                jobContext: {
                    jobId: logJob.id,
                    projectId: logJob.projectId,
                    teamId: logJob.teamId,
                    mode: 'managed' // Default for now, or fetch from job? Job doesn't have mode. Assuming managed.
                }
            });
            await orchestrator.init();

            // 3. Execute Job logic
            const inputs = job.inputs || /* istanbul ignore next */ {};

            if (inputs.prompt) {
                log(`Executing prompt for Job ${jobId}`);
                await this.jobService.streamLog(logJob, `Executing prompt: ${inputs.prompt}`);
                await orchestrator.runAIWorkflow(inputs.prompt);
            } else if (inputs.command) {
                log(`Executing command for Job ${jobId}`);
                await this.jobService.streamLog(logJob, `Executing command: ${inputs.command}`);
                await orchestrator.execute(inputs.command);
            } else {
                throw new Error(`Job ${jobId} has no 'prompt' or 'command' input.`);
            }

            await this.jobService.streamLog(logJob, 'Job completed successfully.');

        } catch (error) {
            log(`Job ${jobId} failed:`, error);
            await this.jobService.streamLog(logJob, `Job failed: ${/* istanbul ignore next */ error instanceof Error ? error.message : String(error)}`, 'error');
            throw error;
        } finally {
            // 4. Teardown Workspace
            if (workspacePath) {
                await this.workspaceManager.cleanupWorkspace(jobId);
            }
        }
    }
}

// Entry point
/* istanbul ignore next */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    new FactoryWorker().start().catch(err => {
        console.error('Worker failed to start:', err);
        process.exit(1);
    });
}
