
import { Orchestrator } from '../dist/orchestrator.js';

async function main() {
    console.log("Starting Manual Verification of Pure OO Architecture...");

    try {
        const rootDir = process.cwd();

        const mockHost = {
            log: (level, message) => console.log(`[${level.toUpperCase()}] ${message}`)
        };

        console.log(`Initializing Orchestrator for root: ${rootDir}`);
        const orchestrator = new Orchestrator(rootDir, mockHost);

        await orchestrator.init();

        console.log("Orchestrator Initialized Successfully.");
        console.log("Session ID:", orchestrator.session?.id);

        // Test Workflow Start
        console.log("Starting Workflow...");
        try {
            await orchestrator.start("Build a simple hello world CLI");
        } catch (e) {
            console.log("Workflow stopped (expectedly) with error:", e.message);
        }

    } catch (error) {
        console.error("Verification Failed:", error);
        process.exit(1);
    }
}

main();
