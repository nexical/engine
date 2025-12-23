import { jest } from '@jest/globals';

import { IFileSystem } from '../../../src/domain/IFileSystem.js';
import { Project } from '../../../src/domain/Project.js';

describe('Project', () => {
  let project: Project;
  let mockFileSystem: jest.Mocked<IFileSystem>;
  const rootDir = '/test/root';

  beforeEach(() => {
    mockFileSystem = {
      exists: jest.fn(),
      readFile: jest.fn(),
      ensureDir: jest.fn(),
      writeFile: jest.fn(),
      deleteFile: jest.fn(),
      listFiles: jest.fn(),
      isDirectory: jest.fn(),
      // Add other methods as needed
    } as unknown as jest.Mocked<IFileSystem>;

    project = new Project(rootDir, mockFileSystem);
  });

  it('should be defined', () => {
    expect(project).toBeDefined();
  });

  it('should ensure directory structure on initialization', () => {
    expect(mockFileSystem.ensureDir.bind(mockFileSystem)).toHaveBeenCalledTimes(9); // count of ensureDir calls in ensureStructure
  });

  describe('getConstraints', () => {
    it('should return constraints from file if exists', () => {
      mockFileSystem.exists.mockReturnValue(true);
      mockFileSystem.readFile.mockReturnValue('constraints content');
      expect(project.getConstraints()).toBe('constraints content');
    });

    it('should return default message if no constraints file', () => {
      mockFileSystem.exists.mockReturnValue(false);
      expect(project.getConstraints()).toContain('No global constraints');
    });
  });

  describe('getConfig', () => {
    it('should return empty config if file does not exist', () => {
      mockFileSystem.exists.mockReturnValue(false);
      expect(project.getConfig()).toEqual({});
    });

    it('should return parsed config if file exists', () => {
      mockFileSystem.exists.mockReturnValue(true);
      mockFileSystem.readFile.mockReturnValue('agents:\n  architect:\n    skill: arch_skill\n');
      const config = project.getConfig();
      expect(config.agents?.architect?.skill).toBe('arch_skill');
    });

    it('should return cached config on subsequent calls', () => {
      mockFileSystem.exists.mockReturnValue(true);
      mockFileSystem.readFile.mockReturnValue('agents: {}');

      const c1 = project.getConfig();
      const c2 = project.getConfig();

      expect(c1).toBe(c2);
      expect(mockFileSystem.readFile.bind(mockFileSystem)).toHaveBeenCalledTimes(1);
    });

    it('should log error and throw if loading fails', () => {
      mockFileSystem.exists.mockReturnValue(true);
      mockFileSystem.readFile.mockImplementation(() => {
        throw new Error('Read failed');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => project.getConfig()).toThrow('Read failed');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load project profile'),
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });
  });
});
