import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import packageJson from './package.json' with { type: 'json' }

// Library build: one ESM file per entry, every dependency and peer left external, all CSS in dist/styles.css.
const external = [...Object.keys(packageJson.dependencies), ...Object.keys(packageJson.peerDependencies)]

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: { index: 'src/core/index.ts', react: 'src/react/index.ts', designer: 'src/designer/index.ts' },
      formats: ['es'],
      cssFileName: 'styles',
    },
    rollupOptions: {
      external: (id) => external.some((name) => id === name || id.startsWith(`${name}/`)),
    },
    sourcemap: true,
  },
  css: { modules: { generateScopedName: 'df-[local]-[hash:base64:5]' } },
  test: { include: ['test/**/*.test.ts'] },
})
