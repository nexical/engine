import { AgentSchema, PlanSchema } from '../../src/utils/validation.js';

describe('Validation Schemas', () => {
    describe('AgentSchema', () => {
        it('should validate a valid agent', () => {
            const validAgent = {
                name: 'test-agent',
                description: 'A test agent',
                command: 'echo',
                args: ['hello'],
            };
            expect(() => AgentSchema.parse(validAgent)).not.toThrow();
        });

        it('should fail if name is missing', () => {
            const invalidAgent = {
                description: 'No name',
            };
            expect(() => AgentSchema.parse(invalidAgent)).toThrow();
        });
    });

    describe('PlanSchema', () => {
        it('should validate a valid plan', () => {
            const validPlan = {
                plan_name: 'Test Plan',
                tasks: [
                    {
                        id: 'task-1',
                        description: 'Task 1',
                        message: 'Doing task 1',
                        agent: 'agent-1',
                    },
                ],
            };
            expect(() => PlanSchema.parse(validPlan)).not.toThrow();
        });

        it('should fail if tasks are missing', () => {
            const invalidPlan = {
                plan_name: 'Invalid Plan',
            };
            expect(() => PlanSchema.parse(invalidPlan)).toThrow();
        });
    });
});
