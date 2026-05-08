import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/main.ts'],
    format: ['cjs'],
    outDir: 'dist',
    outExtension: () => ({ js: '.cjs' }),
    target: 'node22',
    clean: true,
  },
  {
    entry: ['src/renderer.tsx'],
    format: ['esm'],
    outDir: 'dist',
    outExtension: () => ({ js: '.mjs' }),
    target: 'es2022',
    external: ['@mterminal/extension-api'],
    noExternal: [/.*/],
  },
])
