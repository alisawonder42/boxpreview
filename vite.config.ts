import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

const PUBLISH = [
  ['3DModel.fbx', '3DModel.fbx'],
  ['Box-cleaned.glb', 'box.glb'],
] as const

function publishScan(): Plugin {
  const copy = () => {
    const destDir = resolve('public/models')
    mkdirSync(destDir, { recursive: true })
    for (const [from, to] of PUBLISH) {
      if (!existsSync(resolve(from))) continue
      copyFileSync(resolve(from), resolve(destDir, to))
    }
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
  server: {
    host: true,
    allowedHosts: true,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
})
