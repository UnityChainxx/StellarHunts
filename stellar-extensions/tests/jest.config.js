/**
 * Jest config for the stellar-extensions test suites.
 *
 * Run from the repository root:
 *   npx jest --config stellar-extensions/tests/jest.config.js
 */
module.exports = {
  rootDir: __dirname,
  testEnvironment: "node",
  testMatch: ["<rootDir>/**/*.test.ts"],
  // `@nestjs/typeorm` is a backend-only, ESM-only dependency. The wallet
  // services only use its decorators, so extension tests resolve it to a stub.
  moduleNameMapper: {
    "^@nestjs/typeorm$": "<rootDir>/stubs/nestjs-typeorm.js",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.json",
        isolatedModules: true,
      },
    ],
  },
  // `@nestjs/typeorm`, `@nestjs/config`, `@nestjs/schedule` and
  // `@nestjs/mapped-types` v12 are pure ESM; the specs only need their
  // decorator/token surface, so map them to CommonJS shims.
  moduleNameMapper: {
    "^@nestjs/typeorm$": "<rootDir>/support/nestjs-typeorm.ts",
    "^@nestjs/config$": "<rootDir>/support/nestjs-config.ts",
    "^@nestjs/schedule$": "<rootDir>/support/nestjs-schedule.ts",
    "^@nestjs/mapped-types$": "<rootDir>/support/nestjs-mapped-types.ts",
  },
};
