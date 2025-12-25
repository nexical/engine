import { z } from 'zod';
import { Result } from './Result.js';
import { IPromptEngine } from '../services/PromptEngine.js';

/**
 * Generic configuration for any driver, validated by the driver itself.
 * The 'provider' field is the only common requirement for lookup.
 */
export type DriverConfig = Record<string, unknown> & { provider?: string };

/**
 * Context passed to the Skill.execute() method.
 * Provides all necessary dependencies for the standardized 5-step pipeline.
 */
export interface ISkillContext {
    /**
     * Handles CLARIFICATION_NEEDED signals.
     * - ArchitectAgent: Prompts User via RuntimeHost.
     * - Planner/Tasks: Writes to .ai/comms/inbox and polls outbox.
     */
    clarificationHandler: (question: string) => Promise<string>;
    commandRunner: (command: string, args?: string[]) => Promise<string>;
    promptEngine?: IPromptEngine; // Optional but recommended for drivers needing templates

    /**
     * Injectable validators for the Verification Phase.
     * - PlannerAgent: Injects PlanGraphValidator.
     */
    validators: Array<(context: ISkillContext) => Promise<Result<boolean, Error>>>;

    // Domain Services
    fileSystem: any; // Using 'any' for now to avoid circular dependency, ideally IFileSystem
    driverRegistry: any; // Using 'any' for now to avoid circular dependency
    workspaceRoot: string;

    // Execution State
    taskId: string;
    logger: any;
    [key: string]: unknown;
}

/**
 * Root properties of a Skill Configuration (YAML).
 * Encapsulates Environment Setup, Process Config, and Driver Configs.
 */
export interface ISkillConfig {
    name: string;
    description: string;

    // Environment Config (Moved from Driver)
    dependencies?: string[];
    worktree_setup?: string[];
    hydration?: string[];
    sparse_checkout?: string[];

    // Process Config
    analysis_enabled?: boolean;
    pre_analysis_commands?: string[];
    post_execution_commands?: string[];

    verification_strategy?: {
        max_retries: number;
    };

    // Driver Configs (Polymorphic)
    analysis?: DriverConfig;
    execution?: DriverConfig;
    verification?: DriverConfig;

    // Allow additional properties for polymorphism
    [key: string]: unknown;
}

/**
 * Zod Schema for validation of ISkillConfig.
 */
export const SkillSchema = z.object({
    name: z.string(),
    description: z.string().default(''),

    // Environment
    dependencies: z.array(z.string()).optional(),
    worktree_setup: z.array(z.string()).optional(),
    hydration: z.array(z.string()).optional(),
    sparse_checkout: z.array(z.string()).optional(),

    // Process
    analysis_enabled: z.boolean().optional().default(false),
    pre_analysis_commands: z.array(z.string()).optional(),
    post_execution_commands: z.array(z.string()).optional(),

    verification_strategy: z.object({
        max_retries: z.number().default(3),
    }).optional(),

    // Drivers
    analysis: z.record(z.string(), z.unknown()).optional(),
    execution: z.record(z.string(), z.unknown()).optional(),
    verification: z.record(z.string(), z.unknown()).optional(),
}).strict();
