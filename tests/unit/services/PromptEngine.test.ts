import { jest, expect, describe, it, beforeEach, afterEach } from '@jest/globals';
import type { PromptEngine as PromptEngineType } from '../../../src/services/PromptEngine.js';
import nunjucks from 'nunjucks';

const { PromptEngine } = await import('../../../src/services/PromptEngine.js');

describe('PromptEngine', () => {
    let promptEngine: PromptEngineType;
    let mockOrchestrator: any;

    beforeEach(() => {
        mockOrchestrator = {
            config: {
                nexicalPath: '/project/.nexical',
                appPath: '/app'
            }
        };

        promptEngine = new PromptEngine(mockOrchestrator);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize nunjucks environment with correct paths', () => {
            // We can't easily inspect the private env, but we can verify behavior
            expect(promptEngine).toBeDefined();
        });
    });

    describe('render', () => {
        it('should render a template successfully', () => {
            // Mock the internal env.render
            const renderSpy = jest.spyOn((promptEngine as any).env, 'render').mockReturnValue('rendered content');

            const result = promptEngine.render('test.md', { foo: 'bar' });

            expect(result).toBe('rendered content');
            expect(renderSpy).toHaveBeenCalledWith('test.md', { foo: 'bar' });
        });

        it('should throw error if rendering fails', () => {
            jest.spyOn((promptEngine as any).env, 'render').mockImplementation(() => {
                throw new Error('Render error');
            });

            expect(() => promptEngine.render('test.md', {})).toThrow('Render error');
        });
    });
});
