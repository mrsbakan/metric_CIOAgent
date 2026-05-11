import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: true, diagnostics: { ignoreCodes: [151002] } }],
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/__tests__/**",
    "!src/index.ts",
    "!src/prompt-layer-repository.ts",
  ],
  coverageThreshold: { global: { lines: 90, branches: 90, functions: 90, statements: 90 } },
};

export default config;
