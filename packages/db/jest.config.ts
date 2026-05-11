import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: true }],
  },
  testMatch: ["**/__tests__/**/*.test.ts"],
  // Integration tests (require live DB) run separately from unit tests
  testPathPattern: process.env["TEST_TYPE"] === "integration"
    ? "/__tests__/rls"
    : undefined,
  collectCoverageFrom: ["src/**/*.ts", "!src/__tests__/**", "!src/seeds/**"],
  coverageThreshold: {
    global: { lines: 90, branches: 90, functions: 90, statements: 90 },
  },
};

export default config;
