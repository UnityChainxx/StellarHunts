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
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.json",
        isolatedModules: true,
      },
    ],
  },
  // `@nestjs/typeorm` v12 is pure ESM; the specs only need its decorator/token
  // surface, so map it to a CommonJS shim.
  moduleNameMapper: {
    "^@nestjs/typeorm$": "<rootDir>/support/nestjs-typeorm.ts",
    "^@nestjs/config$": "<rootDir>/support/nestjs-config.ts",
  },
};
