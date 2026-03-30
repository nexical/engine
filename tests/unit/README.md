# Unit Testing Guidelines

This directory contains unit tests for the `@nexical/engine` project.

## Structure matches Source
The file structure here mirrors the `src` directory. For every source file `src/path/to/file.ts`, there should be a corresponding test file `tests/unit/path/to/file.test.ts`.

## Testing Principles

1.  **Isolation**: Unit tests must test units in isolation. Use mocks for all dependencies.
2.  **Coverage**: Aim for 100% code coverage. Test all branches and error states.
3.  **Dependency Injection**: The codebase is designed with DI. Pass mocks into constructors.
4.  **No External Side Effects**: Unit tests should not touch the file system or network. If a component interacts with these, mock the interface (e.g., `IFileSystem`, `helper.runCommand`).

## Running Tests

- Run all unit tests: `npm run test:unit`
- Run a specific test: `npm run test:unit -- path/to/file.test.ts`
- Watch mode: `npm run test:unit -- --watch`
