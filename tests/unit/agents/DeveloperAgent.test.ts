
import { jest } from '@jest/globals';
import { DeveloperAgent } from '../../../src/agents/DeveloperAgent.js';
import { IProject } from '../../../src/domain/Project.js';
import { IWorkspace } from '../../../src/domain/Workspace.js';
import { ISkillRunner } from '../../../src/services/SkillRunner.js';
import { RuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { EngineState } from '../../../src/domain/State.js';
import { SignalDetectedError } from '../../../src/errors/SignalDetectedError.js';

describe('DeveloperAgent', () => {
    let agent: DeveloperAgent;
    let mockProject: jest.Mocked<IProject>;
    let mockWorkspace: jest.Mocked<IWorkspace>;
    let mockSkillRunner: jest.Mocked<ISkillRunner>;
    let mockHost: jest.Mocked<RuntimeHost>;
    let state: EngineState;

    beforeEach(() => {
        mockProject = {} as unknown as jest.Mocked<IProject>;
        mockWorkspace = {
            loadPlan: jest.fn(),
            detectSignal: jest.fn().mockResolvedValue(null)
        } as unknown as jest.Mocked<IWorkspace>;
        mockSkillRunner = {
            runSkill: jest.fn()
        } as unknown as jest.Mocked<ISkillRunner>;
        mockHost = {
            log: jest.fn(),
            error: jest.fn()
        } as unknown as jest.Mocked<RuntimeHost>;

        state = {
            user_prompt: 'prompt',
            tasks: {
                pending: [],
                completed: [],
                failed: []
            },
            completeTask: (id: string) => {
                state.tasks.completed.push(id);
            }
        } as unknown as EngineState;

        agent = new DeveloperAgent(mockProject, mockWorkspace, mockSkillRunner, mockHost);
    });

    it('should be defined', () => {
        expect(agent).toBeDefined();
    });

    describe('execute', () => {
        it('should execute tasks in the plan', async () => {
            const mockPlan = {
                plan_name: 'test plan',
                tasks: [
                    { id: '1', message: 'task 1' },
                    { id: '2', message: 'task 2' }
                ]
            };
            mockWorkspace.loadPlan.mockResolvedValue(mockPlan as any);

            await agent.execute(state);

            expect(mockSkillRunner.runSkill).toHaveBeenCalledTimes(2);
            expect(state.tasks.completed).toContain('1');
            expect(state.tasks.completed).toContain('2');
        });

        it('should skip completed tasks', async () => {
            state.tasks.completed = ['1'];
            const mockPlan = {
                plan_name: 'test plan',
                tasks: [
                    { id: '1', message: 'task 1' },
                    { id: '2', message: 'task 2' }
                ]
            };
            mockWorkspace.loadPlan.mockResolvedValue(mockPlan as any);

            await agent.execute(state);

            expect(mockSkillRunner.runSkill).toHaveBeenCalledTimes(1);
            expect(state.tasks.completed).toContain('2');
        });

        it('should handle skill failure', async () => {
            const mockPlan = {
                plan_name: 'test plan',
                tasks: [
                    { id: '1', message: 'task 1' }
                ]
            };
            mockWorkspace.loadPlan.mockResolvedValue(mockPlan as any);
            mockSkillRunner.runSkill.mockRejectedValue(new Error('Skill failed'));

            await expect(agent.execute(state)).rejects.toThrow('Skill failed');
            expect(state.tasks.failed).toContain('1');
        });

        it('should throw SignalDetectedError if signal detected', async () => {
            const mockPlan = {
                plan_name: 'test plan',
                tasks: [
                    { id: '1', message: 'task 1' }
                ]
            };
            mockWorkspace.loadPlan.mockResolvedValue(mockPlan as any);
            mockWorkspace.detectSignal.mockResolvedValue({ type: 'STOP' } as any);

            await expect(agent.execute(state)).rejects.toThrow(SignalDetectedError);
        });

        it('should respect dependencies', async () => {
            const mockPlan = {
                plan_name: 'test plan',
                tasks: [
                    { id: '2', message: 'task 2', dependencies: ['1'] }
                ]
            };
            mockWorkspace.loadPlan.mockResolvedValue(mockPlan as any);

            await agent.execute(state);

            expect(mockSkillRunner.runSkill).not.toHaveBeenCalled();
            expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Skipping task 2'));
        });

        it('should execute task if dependencies are fulfilled', async () => {
            state.tasks.completed = ['1'];
            const mockPlan = {
                plan_name: 'test plan',
                tasks: [
                    { id: '2', message: 'task 2', dependencies: ['1'] }
                ]
            };
            mockWorkspace.loadPlan.mockResolvedValue(mockPlan as any);

            await agent.execute(state);

            expect(mockSkillRunner.runSkill).toHaveBeenCalledWith(expect.objectContaining({ id: '2' }), expect.anything());
            expect(state.tasks.completed).toContain('2');
        });

        it('should return early if all tasks are already completed', async () => {
            state.tasks.completed = ['1', '2'];
            const mockPlan = {
                plan_name: 'test plan',
                tasks: [
                    { id: '1', message: 'task 1' },
                    { id: '2', message: 'task 2' }
                ]
            };
            mockWorkspace.loadPlan.mockResolvedValue(mockPlan as any);

            await agent.execute(state);

            expect(mockSkillRunner.runSkill).not.toHaveBeenCalled();
            expect(mockHost.log).toHaveBeenCalledWith('info', "All tasks in plan are already completed.");
        });
    });
});
