import { jest } from '@jest/globals';

const mockRender = jest.fn();
const mockRenderString = jest.fn();
const mockConfigure = jest.fn();
const mockEnvironment = jest.fn();
const mockFileSystemLoader = jest.fn();

jest.unstable_mockModule('nunjucks', () => ({
  configure: mockConfigure,
  Environment: mockEnvironment,
  FileSystemLoader: mockFileSystemLoader,
  default: {
    configure: mockConfigure,
    Environment: mockEnvironment,
    FileSystemLoader: mockFileSystemLoader,
  },
}));

const mockFs = {
  existsSync: jest.fn(),
  readFileSync: jest.fn().mockReturnValue('template content'),
};
jest.unstable_mockModule('fs-extra', () => ({ default: mockFs, ...mockFs }));

import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import type { PromptEngine as PromptEngineClass } from '../../../src/services/PromptEngine.js';

const { PromptEngine } = await import('../../../src/services/PromptEngine.js');

describe('PromptEngine', () => {
  let engine: PromptEngineClass;
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockEnv: { render: jest.Mock; renderString: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockHost = {
      log: jest.fn<IRuntimeHost['log']>(),
      status: jest.fn<IRuntimeHost['status']>(),
      ask: jest.fn<IRuntimeHost['ask']>(),
      emit: jest.fn<IRuntimeHost['emit']>(),
    };
    mockEnv = { render: mockRender, renderString: mockRenderString };
    // Environment constructor call needs to return instance
    mockEnvironment.mockReturnValue(mockEnv);
    // FileSystemLoader constructor call
    mockFileSystemLoader.mockReturnValue({});

    mockFs.existsSync.mockReturnValue(true);

    engine = new PromptEngine({ promptDirectory: '/prompts', appDirectory: '/app' }, mockHost);
  });

  it('should render template', () => {
    mockRender.mockReturnValue('rendered content');
    const result = engine.render('template.j2', {});
    expect(result).toBe('rendered content');
    expect(mockRender).toHaveBeenCalled();
  });

  it('should log error on render failure', () => {
    mockRender.mockImplementation(() => {
      throw new Error('fail');
    });

    expect(() => engine.render('template.j2', {})).toThrow('fail');
    expect(mockHost.log).toHaveBeenCalledWith('error', expect.any(String));
    expect(mockHost.log).not.toHaveBeenCalledWith('warn', expect.anything());
  });

  it('should warn if no prompt paths found', () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);
    // Re-initialize PromptEngine to trigger the path checking logic
    new PromptEngine({ promptDirectory: '/prompts', appDirectory: '/app' }, mockHost);
    expect(mockHost.log).toHaveBeenCalledWith('warn', 'No valid prompt search paths found. Prompt rendering may fail.');
  });

  it('should render string template', () => {
    mockRenderString.mockReturnValue('rendered string');
    const result = engine.renderString('{{ foo }}', { foo: 'bar' });
    expect(result).toBe('rendered string');
    expect(mockRenderString).toHaveBeenCalledWith('{{ foo }}', { foo: 'bar' });
  });

  it('should log error on renderString failure', () => {
    mockRenderString.mockImplementation(() => {
      throw new Error('string fail');
    });

    expect(() => engine.renderString('{{ foo }}', { foo: 'bar' })).toThrow('string fail');
    expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Error rendering string template'));
  });
});
