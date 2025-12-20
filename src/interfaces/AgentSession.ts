import { Plan } from '../models/Plan.js';

export interface AgentSession {
    /**
     * Unique identifier for the session.
     */
    id: string;

    /**
     * The configuration profile for this session.
     */
    profile: any;

    /**
     * The workspace directory where the agent is operating.
     */
    workspacePath: string;

    /**
     * Current execution history (messages, thoughts).
     */
    history: any[]; // TODO: Define strict Message type

    /**
     * The current active plan.
     */
    plan?: Plan;

    /**
     * Working memory (key-value store).
     */
    memory: Record<string, any>;

    /**
     * Environmental context (teamId, projectId, etc.)
     */
    context?: Record<string, any>;
}
