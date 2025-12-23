/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest/presets/default-esm',
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.ts'],
    resolver: './jest.resolver.cjs',
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                useESM: true,
                tsconfig: 'tsconfig.test.json'
            },
        ],
    },
    extensionsToTreatAsEsm: ['.ts'],
    collectCoverage: true,
    collectCoverageFrom: [
        'src/**/*.{ts,js}',
        '!src/**/*.d.ts'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
};
