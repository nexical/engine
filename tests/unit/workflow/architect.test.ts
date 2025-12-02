import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import type { Architect as ArchitectType } from '../../../src/workflow/architect.js';

const { Architect } = await import('../../../src/workflow/architect.js');

describe('Architect', () => {
    let architect: ArchitectType;
    let mockOrchestrator: any;
    let mockPlugin: any;

    beforeEach(() => {
        mockPlugin = {
            execute: jest.fn<any>().mockResolvedValue('')
        };

        mockOrchestrator = {
            config: {
                projectPath: '/project',
                appPath: '/app',
                agentsPath: '/agents',
                agentsDefinitionPath: '/project/AGENTS.md',
                architecturePath: '/project/.nexical/architecture.md',
                personasPath: '/project/.nexical/personas/',
                logPath: '/project/log.md'
            },
            disk: {
                exists: jest.fn().mockReturnValue(true),
                readFile: jest.fn<any>().mockImplementation((path: any) => {
                    if (path.endsWith('AGENTS.md')) return 'constraints';
                    if (path.endsWith('log.md')) return 'evolution log';
                    return '';
                }),
                writeFile: jest.fn()
            },
            agentRegistry: {
                get: jest.fn<any>().mockImplementation((name: any) => {
                    if (name === 'cli') return mockPlugin;
                    return undefined;
                })
            },
            promptEngine: {
                render: jest.fn().mockReturnValue('rendered prompt')
            }
        };

        architect = new Architect(mockOrchestrator);

        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('generateArchitecture', () => {
        it('should generate architecture successfully', async () => {
            await architect.generateArchitecture('user prompt');

            expect(mockOrchestrator.disk.readFile).toHaveBeenCalledWith('/project/AGENTS.md');
            expect(mockOrchestrator.agentRegistry.get).toHaveBeenCalledWith('cli');

            expect(mockOrchestrator.promptEngine.render).toHaveBeenCalledWith('architect.md', {
                user_request: 'user prompt',
                architecture_file: '/project/.nexical/architecture.md',
                global_constraints: 'constraints',
                personas_dir: '/project/.nexical/personas/',
                evolution_log: 'evolution log'
            });

            expect(mockPlugin.execute).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'architect',
                    command: 'gemini', // Default
                    args: ['prompt', '{prompt}', '--yolo']
                }),
                '',
                expect.objectContaining({
                    userPrompt: 'user prompt',
                    params: expect.objectContaining({
                        prompt: 'rendered prompt'
                    })
                })
            );
        });

        it('should handle missing AGENTS.md', async () => {
            mockOrchestrator.disk.exists.mockImplementation((path: string) => {
                if (path.includes('AGENTS.md')) return false;
                return false;
            });

            await architect.generateArchitecture('user prompt');

            expect(mockOrchestrator.disk.readFile).not.toHaveBeenCalledWith('/project/AGENTS.md');
            // Should still proceed
            expect(mockPlugin.execute).toHaveBeenCalled();

            expect(mockOrchestrator.promptEngine.render).toHaveBeenCalledWith('architect.md', expect.objectContaining({
                global_constraints: "There are no global constraints defined.",
                evolution_log: "No historical failures recorded."
            }));
        });

        it('should throw if CLI plugin not found', async () => {
            mockOrchestrator.agentRegistry.get.mockReturnValue(undefined);
            await expect(architect.generateArchitecture('user prompt')).rejects.toThrow('CLI plugin not found for architect.');
        });

        it('should handle execution errors', async () => {
            mockPlugin.execute.mockRejectedValue(new Error('Execution failed'));
            await expect(architect.generateArchitecture('user prompt')).rejects.toThrow('Execution failed');
            expect(console.error).toHaveBeenCalledWith('Error generating architecture:', expect.any(Error));
        });

        it('should use custom CLI command and args from env', async () => {
            process.env.ARCHITECT_CLI_COMMAND = 'custom-cli';
            process.env.ARCHITECT_CLI_ARGS = '["arg1", "arg2"]';

            await architect.generateArchitecture('user prompt');

            expect(mockPlugin.execute).toHaveBeenCalledWith(
                expect.objectContaining({
                    command: 'custom-cli',
                    args: ['arg1', 'arg2']
                }),
                expect.anything(),
                expect.anything()
            );

            delete process.env.ARCHITECT_CLI_COMMAND;
            delete process.env.ARCHITECT_CLI_ARGS;
        });
    });
});
