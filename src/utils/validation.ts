import { z } from 'zod';

export const AgentSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    prompt_template: z.string().optional(),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    provider: z.string().optional(),
}).passthrough();

export const TaskSchema = z.object({
    id: z.string().optional(),
    description: z.string(),
    message: z.string(),
    skill: z.string(),
    dependencies: z.array(z.string()).optional(),
    params: z.record(z.string(), z.any()).optional(),
});

export const PlanSchema = z.object({
    plan_name: z.string(),
    tasks: z.array(TaskSchema),
});
