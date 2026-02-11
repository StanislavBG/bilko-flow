module.exports = {
  projects: [
    // Core tests (Node environment)
    {
      displayName: 'core',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/tests'],
      testMatch: ['**/*.test.ts'],
      testPathIgnorePatterns: ['<rootDir>/tests/react/'],
      moduleFileExtensions: ['ts', 'js', 'json'],
    },
    // React component tests (jsdom environment)
    {
      displayName: 'react',
      preset: 'ts-jest',
      testEnvironment: 'jsdom',
      roots: ['<rootDir>/tests/react'],
      testMatch: ['**/*.test.tsx', '**/*.test.ts'],
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }],
      },
    },
  ],
};
