import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

const PUBLISH = [
  ['BoxModel.fbx', 'BoxModel.fbx'],
  ['3DModel.fbm/3DModel.jpg', '3DModel.fbm/3DModel.jpg'],
] as const

function publishScan(): Plugin {
  const copy = () => {
    const destDir = resolve('public/models')
    mkdirSync(destDir, { recursive: true })
    for (const [from, to] of PUBLISH) {
      if (!existsSync(resolve(from))) continue
      const dest = resolve(destDir, to)
      mkdirSync(dirname(dest), { recursive: true })
      copyFileSync(resolve(from), dest)
    }
  }

  return {
    name: 'publish-scan',
    buildStart: copy,
    configureServer: copy,
  }
}

function publishPagesFiles(): Plugin {
  const copy = () => {
    mkdirSync('public', { recursive: true })
    if (existsSync(resolve('boot.js'))) copyFileSync(resolve('boot.js'), resolve('public/boot.js'))
    writeFileSync(resolve('public/.nojekyll'), '')
  }

  return {
    name: 'publish-pages-files',
    buildStart: copy,
    configureServer: copy,
  }
}

export default defineConfig({
  base: './',
  plugins: [publishScan(), publishPagesFiles()],
  server: {
    host: true,
    allowedHosts: true,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'assets/viewer.js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
})
