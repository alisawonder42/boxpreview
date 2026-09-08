// Requires glslangValidator on PATH, or pass its absolute path as argument 1.
// Compile the GLSL after Three.js injects its real prefixes and shader chunks.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { WebGLProgram } from 'three/src/renderers/webgl/WebGLProgram.js'
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three'

const source = readFileSync(new URL('../src/viewer/technicalLens.ts', import.meta.url), 'utf8')
const vertexShader = source.match(/const VERTEX =[^`]*`([\s\S]*?)`/)[1]
const fragments = [...source.matchAll(/const (?:BLOOM_)?FRAGMENT =[^`]*`([\s\S]*?)`/g)].map(match => match[1])
const directory = mkdtempSync(join(tmpdir(), 'box-lens-glsl-'))
const gl = {
  VERTEX_SHADER: 'vert', FRAGMENT_SHADER: 'frag',
  createProgram: () => ({}), createShader: type => ({ type }),
  shaderSource: (shader, text) => writeFileSync(join(directory, `lens.${shader.type}`), text),
  compileShader: () => {}, attachShader: () => {}, linkProgram: () => {},
}

try {
  for (const fragmentShader of fragments) {
    new WebGLProgram({ getContext: () => gl }, 'shader-test', {
      vertexShader, fragmentShader, defines: {}, precision: 'highp',
      shaderType: 'ShaderMaterial', shaderName: 'ScanLens',
      toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace,
      rendererExtensionParallelShaderCompile: false,
    }, {})
    execFileSync(process.argv[2] || 'glslangValidator', [
      '-l', join(directory, 'lens.vert'), join(directory, 'lens.frag'),
    ], { stdio: 'inherit' })
  }
  console.log('Three.js-generated lens and bloom shaders compile and link successfully.')
} finally {
  rmSync(directory, { recursive: true, force: true })
}
