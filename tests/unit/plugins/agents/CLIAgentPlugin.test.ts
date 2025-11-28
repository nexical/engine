import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import type { CLIAgentPlugin as CLIAgentPluginType } from '../../../../src/plugins/agents/CLIAgentPlugin.js';
import type { Agent } from '../../../../src/models/Agent.js';

const mockShellExecutor = {
    execute: jest.fn() as any
};

jest.unstable_mockModule('../../../../src/utils/shell.js', () => ({
    ShellExecutor: mockShellExecutor
}));

const { CLIAgentPlugin } = await import('../../../../src/plugins/agents/CLIAgentPlugin.js');

describe('CLIAgentPlugin', () => {
    let cliPlugin: CLIAgentPluginType;
    let mockOrchestrator: any;

    beforeEach(() => {
        mockOrchestrator = {
            config: {
                projectPath: '/project'
            },
            disk: {
                exists: jest.fn().mockReturnValue(true),
                readFile: jest.fn().mockReturnValue('file content')
            }
        };

        cliPlugin = new CLIAgentPlugin(mockOrchestrator);
        mockShellExecutor.execute.mockReset();
    });

    it('should execute a CLI command successfully', async () => {
        mockShellExecutor.execute.mockResolvedValue({
            stdout: 'output',
            stderr: '',
            code: 0
        });

        const agent: Agent = {
            name: 'test-agent',
            command: 'echo',
            args: ['{prompt}'],
            prompt_template: 'Hello {user_request}'
        };

        const result = await cliPlugin.execute(agent, 'task prompt', {
            userPrompt: 'World',
            taskId: 'task-1'
        });

        expect(result).toBe('output');
        expect(mockShellExecutor.execute).toHaveBeenCalledWith(
            'echo',
            ['Hello World'],
            expect.objectContaining({ cwd: '/project' })
        );
    });

    it('should handle file reading', async () => {
        mockShellExecutor.execute.mockResolvedValue({
            stdout: 'output',
            stderr: '',
            code: 0
        });

        const agent: Agent = {
            name: 'test-agent',
            command: 'cat',
            args: ['{file_content}'],
            prompt_template: ''
        };

        await cliPlugin.execute(agent, 'task prompt', {
            params: { file_path: 'test.txt' }
        });

        expect(mockOrchestrator.disk.exists).toHaveBeenCalledWith('/project/test.txt');
        expect(mockOrchestrator.disk.readFile).toHaveBeenCalledWith('/project/test.txt');
        expect(mockShellExecutor.execute).toHaveBeenCalledWith(
            'cat',
            ['file content'],
            expect.any(Object)
        );
    });

    it('should handle missing file', async () => {
        mockOrchestrator.disk.exists.mockReturnValue(false);
        mockShellExecutor.execute.mockResolvedValue({
            stdout: 'output',
            stderr: '',
            code: 0
        });

        const agent: Agent = {
            name: 'test-agent',
            command: 'cat',
            args: ['{file_content}'],
            prompt_template: ''
        };

        await cliPlugin.execute(agent, 'task prompt', {
            params: { file_path: 'test.txt' }
        });

        expect(mockShellExecutor.execute).toHaveBeenCalledWith(
            'cat',
            [''],
            expect.any(Object)
        );
    });

    it('should throw on execution error', async () => {
        mockShellExecutor.execute.mockRejectedValue(new Error('Execution failed'));

        const agent: Agent = {
            name: 'test-agent'
        };

        await expect(cliPlugin.execute(agent, 'task prompt')).rejects.toThrow('Execution failed');
    });

    it('should throw on non-zero exit code', async () => {
        mockShellExecutor.execute.mockResolvedValue({
            stdout: 'output',
            stderr: 'error',
            code: 1
        });

        const agent: Agent = {
            name: 'test-agent',
            command: 'fail',
            args: []
        };

        await expect(cliPlugin.execute(agent, 'task prompt')).rejects.toThrow('Command exited with code 1');
    });
});
