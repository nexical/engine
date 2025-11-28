import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import type { Planner as PlannerType } from '../../src/planner.js';
import type { Plan } from '../../src/models/Plan.js';

const mockPlanUtils = {
    toYaml: jest.fn(),
    fromYaml: jest.fn()
};

jest.unstable_mockModule('../../src/models/Plan.js', () => ({
    PlanUtils: mockPlanUtils
}));

const { Planner } = await import('../../src/planner.js');

describe('Planner', () => {
    let planner: PlannerType;
    let mockOrchestrator: any;
    let mockPlugin: any;

    beforeEach(() => {
        mockPlugin = {
            execute: jest.fn<any>().mockResolvedValue('') // execute returns void/string, result ignored
        };

        mockOrchestrator = {
            config: {
                projectPath: '/project',
                appPath: '/app',
                agentsPath: '/agents',
                historyPath: '/history'
            },
            disk: {
                exists: jest.fn().mockReturnValue(true),
                readFile: jest.fn<any>().mockImplementation((path: any) => {
                    if (path.endsWith('planner.md')) return 'template';
                    if (path.endsWith('capabilities.yml')) return 'capabilities';
                    if (path.endsWith('plan.yml')) return 'tasks: []';
                    return '';
                }),
                writeFile: jest.fn()
            },
            agentRegistry: {
                get: jest.fn<any>().mockImplementation((name: any) => {
                    if (name === 'cli') return mockPlugin;
                    return undefined;
                })
            }
        };

        mockPlanUtils.toYaml.mockReturnValue('yaml content');
        mockPlanUtils.fromYaml.mockReturnValue({ tasks: [] });

        planner = new Planner(mockOrchestrator);

        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should load planner prompt from project if exists', () => {
            expect(mockOrchestrator.disk.exists).toHaveBeenCalledWith('/agents/planner.md');
            expect(mockOrchestrator.disk.readFile).toHaveBeenCalledWith('/agents/planner.md');
        });

        it('should load planner prompt from core if project missing', () => {
            mockOrchestrator.disk.exists.mockReturnValue(false);
            // Re-instantiate to trigger constructor logic
            new Planner(mockOrchestrator);
            expect(mockOrchestrator.disk.readFile).toHaveBeenCalledWith('/app/prompts/planner.md');
        });
    });

    describe('generatePlan', () => {
        it('should generate a plan successfully', async () => {
            const plan = await planner.generatePlan('user prompt');

            expect(mockOrchestrator.disk.readFile).toHaveBeenCalledWith('/agents/capabilities.yml');
            expect(mockOrchestrator.agentRegistry.get).toHaveBeenCalledWith('cli');

            expect(mockPlugin.execute).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'planner',
                    command: 'gemini', // Default
                    args: ['prompt', '{prompt}', '--yolo']
                }),
                '',
                expect.objectContaining({
                    userPrompt: 'user prompt',
                    params: expect.objectContaining({
                        prompt: expect.stringContaining('template')
                    })
                })
            );

            expect(mockOrchestrator.disk.readFile).toHaveBeenCalledWith('/project/.plotris/history/plan.yml');
            expect(mockPlanUtils.fromYaml).toHaveBeenCalledWith('tasks: []');

            // Verify history saving is called (generic check here, specific check in separate test)
            expect(mockPlanUtils.toYaml).toHaveBeenCalledWith({ tasks: [] });
            expect(mockOrchestrator.disk.writeFile).toHaveBeenCalled();

            expect(plan).toEqual({ tasks: [] });
        });

        it('should handle missing capabilities file', async () => {
            mockOrchestrator.disk.exists.mockImplementation((path: string) => {
                if (path.includes('planner.md')) return true;
                if (path.includes('capabilities.yml')) return false;
                return false;
            });

            await planner.generatePlan('user prompt');

            expect(mockOrchestrator.disk.readFile).not.toHaveBeenCalledWith('/agents/capabilities.yml');
            // Should still proceed
            expect(mockPlugin.execute).toHaveBeenCalled();
        });

        it('should throw if CLI plugin not found', async () => {
            mockOrchestrator.agentRegistry.get.mockReturnValue(undefined);
            await expect(planner.generatePlan('user prompt')).rejects.toThrow('CLI plugin not found for planner.');
        });

        it('should handle execution errors', async () => {
            mockPlugin.execute.mockRejectedValue(new Error('Execution failed'));
            await expect(planner.generatePlan('user prompt')).rejects.toThrow('Execution failed');
            expect(console.error).toHaveBeenCalledWith('Error generating plan:', expect.any(Error));
        });

        it('should parse YAML from markdown block', async () => {
            mockOrchestrator.disk.readFile.mockImplementation((path: string) => {
                if (path.endsWith('plan.yml')) {
                    return '```yaml\ntasks: []\n```';
                }
                return 'template';
            });

            await planner.generatePlan('user prompt');
            expect(mockPlanUtils.fromYaml).toHaveBeenCalledWith('tasks: []');
        });

        it('should parse YAML from partial content', async () => {
            mockOrchestrator.disk.readFile.mockImplementation((path: string) => {
                if (path.endsWith('plan.yml')) {
                    return 'Some text\nplan_name: test\ntasks: []';
                }
                return 'template';
            });

            await planner.generatePlan('user prompt');
            expect(mockPlanUtils.fromYaml).toHaveBeenCalledWith('plan_name: test\ntasks: []');
        });

        it('should parse YAML from generic code block', async () => {
            mockOrchestrator.disk.readFile.mockImplementation((path: string) => {
                if (path.endsWith('plan.yml')) {
                    return '```\ntasks: []\n```';
                }
                return 'template';
            });

            await planner.generatePlan('user prompt');
            expect(mockPlanUtils.fromYaml).toHaveBeenCalledWith('tasks: []');
        });

        it('should use custom CLI command and args from env', async () => {
            process.env.PLANNER_CLI_COMMAND = 'custom-cli';
            process.env.PLANNER_CLI_ARGS = '["arg1", "arg2"]';

            await planner.generatePlan('user prompt');

            expect(mockPlugin.execute).toHaveBeenCalledWith(
                expect.objectContaining({
                    command: 'custom-cli',
                    args: ['arg1', 'arg2']
                }),
                expect.anything(),
                expect.anything()
            );

            delete process.env.PLANNER_CLI_COMMAND;
            delete process.env.PLANNER_CLI_ARGS;
        });
        it('should save plan to history', async () => {
            const mockDate = new Date(2023, 0, 1, 12, 0, 0);
            jest.useFakeTimers();
            jest.setSystemTime(mockDate);

            await planner.generatePlan('user prompt');

            // 2023-01-01.12-00-00
            const expectedFilename = 'plan-2023-01-01.12-00-00.yml';
            const expectedPath = '/history/' + expectedFilename;

            expect(mockOrchestrator.disk.writeFile).toHaveBeenCalledWith(expectedPath, 'yaml content');
            expect(mockPlanUtils.toYaml).toHaveBeenCalledWith({ tasks: [] });

            jest.useRealTimers();
        });
    });
});
