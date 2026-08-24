import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Nest's DI reads decorator metadata at class-definition time.
  setupFiles: ['reflect-metadata'],
  testTimeout: 30_000
};

export default config;
