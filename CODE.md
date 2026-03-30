# Nexical Engine Coding Standards

> **CRITICAL**: This document is the **SINGLE SOURCE OF TRUTH** for all coding standards in this repository.
> AI Models: You **MUST** read and strictly follow these rules. Failure to do so will result in rejected code.

## 1. Project Structure (Standalone)

Treat this repository as a **STANDALONE** project. Do not infer relationships with any parent monorepo.

- **Root**: `./` (The `package.json` location)
- **Source**: `./src` (All TypeScript source code)
- **Tests**: `./tests` (Unit and Integration tests)
- **Dist**: `./dist` (Compiled output, `outDir`)

## 2. TypeScript Standards

**Configuration**: `ES2022` target, `NodeNext` module resolution, Strict Mode enabled.

### 2.1 Strict Type Safety
- **State**: `strict: true` is enabled in `tsconfig.json`.
- **No Implicit Any**: implicit `any` is forbidden.
- **Strict Null Checks**: `null` and `undefined` are distinct types. You must handle them explicitly.

### 2.2 Imports & Exports
- **ESM Syntax**: Use ESM syntax (`import`/`export`) exclusively.
- **File Extensions**: Imports **MUST** include the `.js` extension for local files.
  - **Correct**: `import { Foo } from './Foo.js';`
  - **Incorrect**: `import { Foo } from './Foo';`
- **Type Imports**: Use `import type { ... }` when importing types to avoid runtime overhead and circular dependency issues.

## 3. Linting Rules (ESLint)

We enforce a strict set of rules using `eslint.config.js`.

### 3.1 The "No Any" Rule (CRITICAL)
- **Rule**: `@typescript-eslint/no-explicit-any`: `error`
- **Policy**: You are **FORBIDDEN** from using the `any` type.
  - **Why**: `any` defeats the purpose of TypeScript.
  - **Exception**: If you absolutely *must* use `any` (e.g., interaction with a legacy library with bad types, or extremely generic interaction), you **MUST** disable the rule for that specific line.
  - **Syntax**:
    ```typescript
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const weirdData: any = externalLib.getData();
    ```
  - **Preference**: Use `unknown` instead of `any` whenever possible, and use type guards to narrow it.

### 3.2 Naming Conventions
- **Rule**: `@typescript-eslint/naming-convention`
- **Interfaces**: MUST be PascalCase and start with `I`.
  - **Regex**: `^I[A-Z]`
  - **Example**: `interface IUserService { ... }`
- **Classes/Types**: PascalCase.
- **Variables/Functions**: camelCase.

### 3.3 Explicit Returns
- **Rule**: `@typescript-eslint/explicit-function-return-type`: `error`
- **Policy**: All functions and methods **MUST** have an explicit return type definition.
  - **Why**: Prevents accidental return changes and improves readability.

### 3.4 Unused Variables
- **Rule**: `@typescript-eslint/no-unused-vars`: `error`
- **Policy**: No unused variables allowed.
- **Exception**: Arguments starting with `_` are ignored (e.g., `(_req, res) => ...`).

### 3.5 Async/Promise Handling
- **Rule**: `@typescript-eslint/no-floating-promises`: `error`
  - **Policy**: You **MUST** handle all Promises. Await them, return them, or explicitly catch them.
- **Rule**: `@typescript-eslint/await-thenable`: `error`
  - **Policy**: Only await Thenables.
- **Rule**: `@typescript-eslint/no-misused-promises`: `error`
  - **Policy**: Checks for places where a Promise is used in a place that isn't expected (e.g., if statements).

### 3.6 Import Sorting
- **Rule**: `simple-import-sort/imports`: `error`
- **Rule**: `simple-import-sort/exports`: `error`
- **Policy**: Imports and exports must be sorted. The linter fix will handle this, but try to write them sorted to avoid lint errors.

### 3.7 Other Rules
- **`consistent-type-definitions`**: `['error', 'interface']` (Use `interface` instead of `type` for object definitions).
- **`no-console`**: `warn` (Avoid `console.log` in production code; use a logger).
- **`eqeqeq`**: `['error', 'always']` (Use `===` and `!==`, never `==` or `!=`).

## 4. Formatting Rules (Prettier)

Code must be formatted according to `.prettierrc`.

- **Semi-colons**: `true` (Always use semicolons).
- **Trailing Comma**: `all` (Trailing commas wherever possible, including function arguments).
- **Single Quote**: `true` (Use single quotes `'` by default, double `"` for JSX/HTML).
- **Print Width**: `120` characters.
- **Tab Width**: `2` spaces.
- **Use Tabs**: `false` (Use spaces).
- **End of Line**: `lf` (Unix line endings).

## 5. AI Instructions (For Zero-Shot Compliance)

**Instructions for AI Coding Agents**:

1.  **Analyze**: Before writing code, check this file.
2.  **No `any`**: If you write `: any`, you have failed. Use `unknown` or define a type. If you *must* use `any`, add the disable comment.
3.  **Interfaces**: If you define an interface `User`, you have failed. It must be `IUser`.
4.  **Imports**: If you write `from './utils'`, you have failed. It must be `from './utils.js'`.
5.  **Returns**: If you write `function foo() { ... }`, you have failed. It must be `function foo(): void { ... }`.
6.  **Formatting**: Ensure lines are < 120 chars. Use 2 spaces indentation.
7.  **Self-Correction**: If you generate code, mentally run "eslint" on it. Did you leave an unused var? Did you forget a return type? Fix it *before* outputting.

---
**Summary Checklist for Code Generation**:
- [ ] No `any` (or explicitly disabled)
- [ ] Interfaces start with `I`
- [ ] Explicit return types
- [ ] `.js` extension on local imports
- [ ] No unused vars (or prefix `_`)
- [ ] All promises awaited/handled
- [ ] Prettier format (120 width, single quote, semi, 2 spaces)
