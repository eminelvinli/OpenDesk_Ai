/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',

    // Only run eval tests when using the test:evals script.
    // Regular `npm test` should not pick up evals (they are slow + cost money).
    testMatch: ['**/__tests__/**/*.ts', '**/*.test.ts', '!**/tests/evals/**'],

    moduleNameMapper: {
        // Allow importing from src/  paths without relative maze.
        '^@/(.*)$': '<rootDir>/src/$1',
    },

    transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', {
            tsconfig: {
                // Evals use ESM-compatible imports; CommonJS for Jest compat.
                module: 'CommonJS',
                esModuleInterop: true,
            },
        }],
    },

    // Separate project config for evals (can be run independently).
    projects: [
        {
            displayName: 'unit',
            preset: 'ts-jest',
            testEnvironment: 'node',
            testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/tests/unit/**/*.test.ts'],
        },
        {
            displayName: 'evals',
            preset: 'ts-jest',
            testEnvironment: 'node',
            testMatch: ['<rootDir>/tests/evals/**/*.eval.test.ts'],
            testTimeout: 60_000, // Vision LLM calls can take up to 30s
            transform: {
                '^.+\\.ts$': ['ts-jest', {
                    tsconfig: {
                        module: 'CommonJS',
                        esModuleInterop: true,
                        strict: false,
                    },
                }],
            },
        },
    ],
};
