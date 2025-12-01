import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import type { Architect as ArchitectType } from '../../src/architect.js';

const { Architect } = await import('../../src/architect.js');

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
                agentsPath: '/agents'
            },
            disk: {
                exists: jest.fn().mockReturnValue(true),
                readFile: jest.fn<any>().mockImplementation((path: any) => {
                    if (path.endsWith('architect.md')) return 'template {user_request} {global_constraints}';
                    if (path.endsWith('AGENTS.md')) return 'constraints';
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

        architect = new Architect(mockOrchestrator);

        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should load architect prompt from project if exists', () => {
            expect(mockOrchestrator.disk.exists).toHaveBeenCalledWith('/agents/architect.md');
            expect(mockOrchestrator.disk.readFile).toHaveBeenCalledWith('/agents/architect.md');
        });

        it('should load architect prompt from core if project missing', () => {
            mockOrchestrator.disk.exists.mockReturnValue(false);
            // Re-instantiate to trigger constructor logic
            new Architect(mockOrchestrator);
            expect(mockOrchestrator.disk.readFile).toHaveBeenCalledWith('/app/prompts/architect.md');
        });
    });

    describe('generateArchitecture', () => {
        it('should generate architecture successfully', async () => {
            await architect.generateArchitecture('user prompt');

            expect(mockOrchestrator.disk.readFile).toHaveBeenCalledWith('/project/AGENTS.md');
            expect(mockOrchestrator.agentRegistry.get).toHaveBeenCalledWith('cli');

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
                        prompt: expect.stringContaining('template')
                    })
                })
            );

            // We check that constraints are injected
            const executeCall = mockPlugin.execute.mock.calls[0];
            const params = executeCall[2].params;
            expect(params.prompt).toContain('constraints');
        });

        it('should handle missing AGENTS.md', async () => {
            mockOrchestrator.disk.exists.mockImplementation((path: string) => {
                if (path.includes('architect.md')) return true;
                if (path.includes('AGENTS.md')) return false;
                return false;
            });

            await architect.generateArchitecture('user prompt');

            expect(mockOrchestrator.disk.readFile).not.toHaveBeenCalledWith('/project/AGENTS.md');
            // Should still proceed
            expect(mockPlugin.execute).toHaveBeenCalled();
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

        it('should save architecture if plugin returns string', async () => {
            mockPlugin.execute.mockResolvedValue('architecture content');

            await architect.generateArchitecture('user prompt');

            expect(mockOrchestrator.disk.writeFile).toHaveBeenCalledWith(
                '/project/.plotris/architecture.md',
                'architecture content'
            );
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
