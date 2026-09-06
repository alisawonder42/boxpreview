import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

const ROOT_SCANS = ['Box-cleaned.glb', 'box.glb', '3DModel.glb', 'scan.glb']

function publishScan(): Plugin {
  const copy = () => {
    const destDir = resolve('public/models')
    const dest = resolve(destDir, 'box.glb')
    if (existsSync(dest)) return
    const srcName = ROOT_SCANS.find((name) => existsSync(resolve(name)))
    if (!srcName) return
    mkdirSync(destDir, { recursive: true })
    copyFileSync(resolve(srcName), dest)
  }

  return {
    name: 'publish-scan',
    buildStart: copy,
    configureServer: copy,
  }
}

export default defineConfig({
  base: './',
  plugins: [publishScan()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
})
