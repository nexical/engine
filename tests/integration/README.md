# Integration Testing Guide

This directory contains integration tests for the `@astrical/engine`. Unlike unit tests which isolate individual classes, these tests verify the interaction between multiple components (Agents, Services, Workflow, Drivers) in a controlled environment.

## Philosophy

Our integration testing strategy follows a **"Real Logic, Mocked IO/AI"** approach:

*   **Real Logic**: We use real instances of `Orchestrator`, `Agents`, `Workflow`, and `Services`. We want to test that the state machine transitions correctly and that agents invoke the right tools with the right prompts.
*   **Real Filesystem**: We use a temporary directory for the workspace. This ensures `FileSystemService` and `GitService` actually write files, which is critical for verifying side effects.
*   **Mocked AI**: We **ALWAYS** mock the AI Drivers (`GeminiDriver`, `ImageGenDriver`). Calling real LLMs in CI is slow, non-deterministic, and expensive. We verify that the *correct prompt* was sent and then return a *canned response* to drive the test forward.

## Getting Started

Integration tests are run using `jest`.

```bash
# Run all integration tests
npm run test:integration

# Run a specific test file
NODE_OPTIONS=--experimental-vm-modules npx jest tests/integration/MyFeature.test.ts
```

## Anatomy of an Integration Test

A standard integration test involves setting up an `Orchestrator` pointing to a temporary directory, replacing its "Drivers" with mocks, and then executing a high-level command.

### 1. Setup

Use the `ServiceFactory` or manually construct the `Orchestrator` to wire up the system.

```typescript
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { Orchestrator } from '../../src/orchestrator.js';
import { ConsoleLogger } from '../../src/domain/RuntimeHost.js';

// 1. Create a temp directory
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astrical-test-'));

// 2. Initialize Host and Orchestrator
const host = { ...ConsoleLogger, log: jest.fn() }; // Mock logger to keep output clean
const orchestrator = new Orchestrator(tmpDir, host);
await orchestrator.init();
```

### 2. Mocking Drivers

The most critical step is intercepting the AI calls. We do this by interacting with the `DriverRegistry`.

```typescript
// Create a mock driver
const mockGemini = {
  name: 'gemini',
  isSupported: async () => true,
  execute: jest.fn().mockResolvedValue({
    isFail: () => false,
    value: () => 'Mocked AI Response', // <--- Control the agent's behavior here
  }),
};

// Register it (forcing it as default)
orchestrator.session.driverRegistry.register(mockGemini, true);
```

### 3. Execution

Run the command you want to test.

```typescript
// Execute a prompt
await orchestrator.execute("Build a landing page");
```

### 4. Verification

Verify not just the output, but the *side effects* and *state transitions*.

```typescript
// Verify AI was called with expected prompt
expect(mockGemini.execute).toHaveBeenCalledWith(
  expect.objectContaining({ name: 'architect' }), // Skill name
  expect.objectContaining({
    params: expect.objectContaining({
      prompt: expect.stringContaining('Build a landing page'),
    }),
  })
);

// Verify files were created (Real FS)
const layoutExists = await fs.pathExists(path.join(tmpDir, 'content/pages/index.yaml'));
expect(layoutExists).toBe(true);
```

### 5. Cleanup

Always clean up the temp directory.

```typescript
afterAll(async () => {
  await fs.remove(tmpDir);
});
```

## Best Practices

1.  **Isolation**: Every test file should create its own unique temporary directory. Never share state between test files.
2.  **Mock Responsiveness**: If you are testing a multi-turn conversation (e.g. Planning -> Architecture -> Coding), your mock driver needs to return different responses based on the input prompt. Use `mockImplementation` for this.
    ```typescript
    mockGemini.execute.mockImplementation(async (skill, ctx) => {
       if (skill.name === 'architect') return success("Architecture Draft");
       if (skill.name === 'developer') return success("Code Implemented");
       return failure("Unknown skill");
    });
    ```
3.  **Timeout**: Orchestrator flows can be long. Increase Jest timeout if necessary: `jest.setTimeout(30000);`.
4.  **No Network**: There should be **zero** network calls in these tests. If a test hits the internet, it's a bug in the test setup.

## Example: Full Smoke Test

Create `tests/integration/SmokeTest.test.ts`:

```typescript
import { jest } from '@jest/globals';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { Orchestrator } from '../../src/orchestrator.js';

describe('Engine Smoke Test', () => {
  let tmpDir: string;
  let orchestrator: Orchestrator;
  let mockDriver: any;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'engine-test-'));
    
    // Mock Host
    const mockHost = {
      log: jest.fn(),
      emit: jest.fn(),
      ask: jest.fn(),
    };

    // Initialize
    orchestrator = new Orchestrator(tmpDir, mockHost);
    await orchestrator.init();

    // Mock Driver
    mockDriver = {
      name: 'gemini',
      isSupported: async () => true,
      execute: jest.fn().mockResolvedValue({
        isFail: () => false,
        value: () => 'Mocked Success',
        error: () => null
      })
    };
    
    // Inject Mock
    // Note: We need to access the registry via the session or service container
    // Because orchestrator.init() creates a fresh container, we access it via the public session getter if available,
    // or we might need to verify how to best inject into a running instance. 
    // Ideally, Orchestrator exposes the services.
    const registry = (orchestrator as any)._session.driverRegistry; 
    registry.register(mockDriver, true);
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  test('should run a simple planning flow', async () => {
    await orchestrator.execute('Plan a new feature');
    
    expect(mockDriver.execute).toHaveBeenCalled();
    // specific assertions...
  });
});
```
