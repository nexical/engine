import { Application } from './Application.js';
import { Plan } from './Plan.js';

export class AgentSession {
    /**
     * Unique identifier for the session.
     */
    public id: string;

    /**
     * Current execution history (messages, thoughts).
     */
    public history: any[];

    /**
     * The current active plan.
     */
    public plan?: Plan;

    /**
     * Working memory (key-value store).
     */
    public memory: Record<string, any>;

    /**
     * Environmental context (teamId, projectId, etc.)
     */
    public context?: Record<string, any>;

    constructor(app: Application) {
        this.id = new Date().toISOString().replace(/[:.]/g, '-');
        this.history = [];
        this.memory = {};
        this.context = {};
        this.plan = {} as Plan;
    }
}
