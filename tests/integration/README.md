# Integration Testing Guide

This directory contains integration tests for the `@astrical/engine`. Unlike unit tests which isolate individual classes, these tests verify the interaction between multiple components (Agents, Services, Workflow, Drivers) in a controlled environment.

## Philosophy

Our integration testing strategy follows a **"Real Logic, Mocked IO/AI"** approach:

*   **Real Logic**: We use real instances of `Orchestrator`, `Agents`, `Workflow`, and `Services`. We want to test that the state machine transitions correctly and that agents invoke the right tools with the right prompts.
*   **Real Filesystem**: We use a temporary directory for the workspace. This ensures `FileSystemService` and `GitService` actually write files, which is critical for verifying side effects.
*   **Mocked AI**: We **ALWAYS** mock the AI Drivers (`GeminiDriver`). Calling real LLMs in CI is slow, non-deterministic, and expensive. We verify that the *correct prompt* was sent and then return a *canned response* to drive the test forward.

## Getting Started

Integration tests are run using `jest`.

```bash
# Run all integration tests
npm run test:integration

# Run a specific test file
NODE_OPTIONS=--experimental-vm-modules npx jest tests/integration/MyFeature.test.ts
```

## The Standard: ProjectFixture

All new integration tests **MUST** use the `ProjectFixture` utility. This class encapsulates the boilerplate for creating temporary directories, initializing the orchestrator, and mocking drivers.

### Quick Start Example

Create `tests/integration/MyFeature.test.ts`:

```typescript
/**
 * @file MyFeature.test.ts
 * 
 * SCOPE:
 * Briefly explain what feature this test covers.
 * 
 * COVERAGE:
 * - Specific Method A
 * - Specific Scenario B
 */

import { jest } from '@jest/globals';
import { ProjectFixture } from './utils/ProjectFixture.js';

describe('My Feature Integration', () => {
    let fixture: ProjectFixture;

    beforeEach(async () => {
        fixture = new ProjectFixture();
        await fixture.setup(); // Creates temp dir
    });

    afterEach(async () => {
        await fixture.cleanup(); // Cleans up temp dir
    });

    test('should do something amazing', async () => {
        // 1. Setup Config & Content
        await fixture.writeConfig({ project_name: 'MyTest' });
        await fixture.writeSkill('dev-skill', { provider: 'gemini' });

        // 2. Initialize System
        const orchestrator = await fixture.initOrchestrator();

        // 3. Mock Driver Behavior
        fixture.registerMockDriver('gemini', async (skill, ctx) => {
            if (skill.name === 'architect') {
                return { 
                    isFail: () => false, 
                    unwrap: () => ProjectFixture.createArchitectResult(), 
                    error: () => null 
                };
            }
            return { isFail: () => false, unwrap: () => 'OK', error: () => null };
        });

        // 4. Run & Assert
        await orchestrator.start('Do it');
        expect(orchestrator.session.state.status).toBe('COMPLETED');
    });
});
```

### Key Utilities

| Function | Purpose |
| :--- | :--- |
| `fixture.setup()` | Creates a temp directory and standard `.ai` folders. |
| `fixture.cleanup()` | Removes the temp directory and restores mocks. |
| `fixture.writeConfig(config)` | Writes/Overwrites `.ai/config.yml`. |
| `fixture.writePrompt(name, content)` | Writes a prompt template to `.ai/prompts`. |
| `fixture.writeSkill(name, data)` | Writes a skill definition to `.ai/skills`. |
| `fixture.initOrchestrator(bypass)` | Initializes the full system. Pass `true` (default) to bypass mock validation. |
| `fixture.registerMockDriver(name, cb)` | Registers a driver mock. `cb` receives `(skill, ctx)`. |
| `ProjectFixture.createArchitectResult()` | Static helper to generate a valid Architecture markdown string. |
| `ProjectFixture.createPlanResult(tasks)` | Static helper to generate a valid Plan YAML string. |

## Best Practices

1.  **Use Headers**: Every test file must start with a comment block defining `@file`, `SCOPE`, and `COVERAGE`.
2.  **Mock Responsively**: Your mock driver should inspect `skill.name` to return appropriate artifacts (Architecture for Architect, Plan for Planner).
3.  **Validate Side Effects**: Don't just check `state.status`. Check that files were written, git commits were made, or logs were generated.
4.  **No Network**: If your test hits the real method API, it is NOT an integration test.
