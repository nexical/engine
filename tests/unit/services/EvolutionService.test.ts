/* eslint-disable */
import { jest } from '@jest/globals';

// Mock Node.js fs module
const mockAppendFile = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockCreateReadStream = jest.fn<(...args: unknown[]) => unknown>();
const mockExistsSync = jest.fn<(...args: unknown[]) => boolean>();

jest.unstable_mockModule('fs', () => ({
  default: {
    promises: {
      appendFile: mockAppendFile,
    },
    createReadStream: mockCreateReadStream,
    existsSync: mockExistsSync,
  },
}));

// Mock readline module
const mockRl = {
  [Symbol.asyncIterator]: jest.fn(),
};
const mockCreateInterface = jest.fn(() => mockRl);

jest.unstable_mockModule('readline', () => ({
  __esModule: true,
  default: {
    createInterface: mockCreateInterface,
  },
  createInterface: mockCreateInterface,
}));

// Import dependencies
import { IFileSystem } from '../../../src/domain/IFileSystem.js';
import { IProject } from '../../../src/domain/Project.js';
import { Signal, SignalType } from '../../../src/workflow/Signal.js';

// Standalone mock variables for IFileSystem
const mockExists = jest.fn<IFileSystem['exists']>();
const mockReadFile = jest.fn<IFileSystem['readFile']>();
const mockWriteFileAtomic = jest.fn<IFileSystem['writeFileAtomic']>();

describe('EvolutionService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let EvolutionService: any;
  let service: any;
  let mockProject: jest.Mocked<IProject>;
  let mockFileSystem: jest.Mocked<IFileSystem>;

  beforeEach(async () => {
    // Re-import module for every test to apply mocks
    const module = await import('../../../src/services/EvolutionService.js');
    EvolutionService = module.EvolutionService;

    mockAppendFile.mockClear();
    mockCreateReadStream.mockClear();
    mockExistsSync.mockClear();
    mockCreateInterface.mockReset();
    mockCreateInterface.mockReturnValue(mockRl); // Restore implementation

    mockExists.mockReset();
    mockReadFile.mockReset();
    mockWriteFileAtomic.mockReset();
    // Default mock implementation
    mockRl[Symbol.asyncIterator].mockImplementation(async function* () {
      // yield nothing by default
    });

    mockFileSystem = {
      exists: mockExists,
      readFile: mockReadFile,
      writeFileAtomic: mockWriteFileAtomic,
    } as unknown as jest.Mocked<IFileSystem>;

    mockProject = {
      paths: {
        log: 'evolution.jsonl',
        evolutionIndex: 'evolution/index.json',
        evolutionTopics: 'evolution/topics',
      },
      fileSystem: mockFileSystem,
    } as unknown as jest.Mocked<IProject>;

    service = new EvolutionService(mockProject, mockFileSystem);
  });

  it('should record event as JSON line', async () => {
    mockAppendFile.mockResolvedValue(undefined);
    const signal = new Signal(SignalType.FAIL, 'error');

    await service.recordEvent('state', signal);

    expect(mockAppendFile).toHaveBeenCalledTimes(1);
    const callArgs = mockAppendFile.mock.calls[0] as [string, string, string];
    expect(callArgs[0]).toBe('evolution.jsonl');

    // Check if valid JSON
    const content = JSON.parse(callArgs[1]);
    expect(content).toMatchObject({
      state: 'state',
      signal_type: 'FAIL',
      reason: 'error',
    });
  });

  it('should retrieve short term memory from JSONL stream', async () => {
    mockExistsSync.mockReturnValue(true);

    // Mock Async Iterator for readline
    const lines = [
      JSON.stringify({ timestamp: '1', state: 'S1', signal_type: 'T1', reason: 'R1', feedback: 'F1' }),
      JSON.stringify({ timestamp: '2', state: 'S2', signal_type: 'T2', reason: 'R2' }),
    ];

    mockRl[Symbol.asyncIterator].mockImplementation(async function* () {
      for (const line of lines) {
        yield line;
      }
    });

    const summary = await service.retrieve('');

    expect(mockCreateReadStream).toHaveBeenCalledWith('evolution.jsonl');
    expect(summary).toContain('## Recent Events (Short-Term Memory)');
    expect(summary).toContain('S1');
    expect(summary).toContain('User Feedback: F1');
    expect(summary).toContain('S2');
  });

  it('should handle missing log for retrieve', async () => {
    mockExistsSync.mockReturnValue(false); // fs.existsSync
    mockExists.mockReturnValue(false); // disk.exists (for index)

    const summary = await service.retrieve('');
    expect(summary).toBe('No historical failures or wisdom recorded.');
  });

  it('should retrieve long term wisdom based on keywords', async () => {
    mockExistsSync.mockReturnValue(false); // No log

    // Mock Index/Topics via IFileSystem (disk)
    mockExists.mockImplementation((path: string) => {
      // Allow index file check
      if (path.includes('evolution/index.json')) return true;
      // Allow topic file check
      if (path.includes('evolution/topics/git.md')) return true;
      return false;
    });

    mockReadFile.mockImplementation((path: string) => {
      if (path.includes('evolution/index.json')) return JSON.stringify({ commit: 'git', push: 'git' });
      if (path.includes('evolution/topics/git.md')) return 'Git rules.';
      return '';
    });

    const summary = await service.retrieve('I cannot commit changes');

    // Retrieve returns a Promise now!
    expect(summary).toContain('## Established Wisdom (Long-Term Memory)');
    expect(summary).toContain('### Topic: git');
    expect(summary).toContain('Git rules.');
  });
});
