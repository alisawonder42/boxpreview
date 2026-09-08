import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createBoxCorruption } from '../src/viewer/boxCorruption.ts'
import { DEFAULT_LENS } from '../src/viewer/technicalLens.ts'
import { DEFAULT_CRT } from '../src/viewer/analogCRT.ts'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { WebGLProgram } from 'three/src/renderers/webgl/WebGLProgram.js'

let reduced = false
globalThis.window = { matchMedia: () => ({ get matches() { return reduced } }) }

function setup(pixelRatio = 1) {
  const calls = []
  let target = null
  let scissorTest = false
  const scissor = new THREE.Vector4(0, 0, 800, 600)
  let clearColor = new THREE.Color('white')
  let clearAlpha = 1
  const renderer = {
    autoClear: true,
    shadowMap: { autoUpdate: true },
    domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) },
    getDrawingBufferSize: (out) => out.set(800 * pixelRatio, 600 * pixelRatio),
    getPixelRatio: () => pixelRatio,
    getRenderTarget: () => target,
    setRenderTarget: (next) => { target = next },
    getScissorTest: () => scissorTest,
    setScissorTest: (value) => { scissorTest = value },
    getScissor: (out) => out.copy(scissor),
    setScissor: (x, y, w, h) => x instanceof THREE.Vector4 ? scissor.copy(x) : scissor.set(x, y, w, h),
    getClearColor: (out) => out.copy(clearColor),
    getClearAlpha: () => clearAlpha,
    setClearColor: (color, alpha) => { clearColor = new THREE.Color(color); clearAlpha = alpha },
    clear: () => {},
    render: (object) => calls.push({ object, target, autoClear: renderer.autoClear, scissorTest, scissor: scissor.clone(),
      materials: object instanceof THREE.Scene ? object.children.filter(child => child instanceof THREE.Mesh).map(mesh => mesh.material) : [],
    }),
  }
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('white')
  const subject = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial())
  scene.add(subject, floor)
  const corruption = createBoxCorruption(renderer)
  corruption.setSubject(subject)
  return { renderer, corruption, scene, subject, floor, calls }
}


const camera = new THREE.PerspectiveCamera(40, 800 / 600, 0.1, 100)
camera.position.set(2, 2, 3)
camera.lookAt(0, 0, 0)
camera.updateMatrixWorld()
const maskShaders = []
for (const ratio of [1, 1.5, 2]) {
  const { renderer, corruption, scene, subject, floor, calls } = setup(ratio)
  const original = subject.material
  original.alphaTest = 0.3
  original.map = new THREE.Texture()
  original.alphaMap = new THREE.Texture()
  const vertices = subject.geometry.attributes.position.array.slice()
  const destination = new THREE.WebGLRenderTarget(800, 600)
  renderer.setRenderTarget(destination)
  renderer.setScissor(12, 14, 300, 200)
  renderer.setScissorTest(true)
  corruption.render(scene, camera, 1)
  assert.equal(calls.length, 4)
  assert.equal(calls[0].target, destination, 'untouched scene renders directly first')
  assert.equal(calls[1].target.texture.name, 'BoxCorruption.original')
  assert.equal(calls[1].materials[0], original, 'effect color is the original textured render')
  assert.equal(calls[2].target.texture.name, 'BoxCorruption.visibleMask')
  const [subjectMask, occluderMask] = calls[2].materials
  assert.equal(subjectMask.map, original.map)
  assert.equal(subjectMask.alphaMap, original.alphaMap)
  assert.equal(subjectMask.alphaTest, 0.3, 'mask retains cutout geometry')
  assert.equal(occluderMask.depthWrite, true, 'non-subject objects occlude the visible mask')
  for (const [mask, alpha] of [[subjectMask, '1.0'], [occluderMask, '0.0']]) {
    const shader = { ...THREE.ShaderLib.basic }
    mask.onBeforeCompile(shader)
    assert.ok(shader.fragmentShader.includes('gl_FragColor.a = ' + alpha))
    assert.ok(shader.fragmentShader.includes('cross(dFdx(vBoxViewPosition), dFdy(vBoxViewPosition))'))
    if (ratio === 1) maskShaders.push(shader)
  }
  const output = calls[3]
  assert.equal(output.target, destination)
  assert.equal(output.autoClear, false, 'composite cannot clear background or stable outline')
  assert.equal(output.scissorTest, true)
  assert.deepEqual(output.scissor.toArray(), [12, 14, 300, 200])
  assert.equal(output.object.material.transparent, false)
  assert.equal(output.object.material.blending, THREE.NoBlending)
  const uniforms = output.object.material.uniforms
  assert.equal(uniforms.tScene.value, calls[1].target.texture)
  assert.equal(uniforms.tMask.value, calls[2].target.texture)
  assert.deepEqual(uniforms.uResolution.value.toArray(), [800 * ratio, 600 * ratio])
  assert.equal(subject.material, original)
  assert.equal(floor.visible, true)
  assert.equal(scene.background.getHex(), 0xffffff)
  assert.equal(renderer.shadowMap.autoUpdate, true)
  assert.equal(renderer.getRenderTarget(), destination)
  assert.deepEqual(subject.geometry.attributes.position.array, vertices, 'geometry remains untouched')
  reduced = true
  corruption.render(scene, camera, 2)
  const heldTime = uniforms.uTime.value
  corruption.render(scene, camera, 3)
  assert.equal(uniforms.uTime.value, heldTime, 'reduced motion holds a stable signal state')
  reduced = false
  calls.length = 0
  corruption.params.blendAmount = 0
  corruption.render(scene, camera, 4)
  assert.equal(calls.length, 1, 'zero blend bypasses all effect captures')
  calls.length = 0
  corruption.params.blendAmount = 1
  corruption.params.enabled = false
  corruption.render(scene, camera, 5)
  assert.equal(calls.length, 1, 'disabled effect is the original render')
  corruption.params.enabled = true
  const render = renderer.render
  renderer.render = object => {
    if (renderer.getRenderTarget()?.texture.name === 'BoxCorruption.visibleMask') throw Error('mask failure')
    render(object)
  }
  assert.throws(() => corruption.render(scene, camera, 6), /mask failure/)
  assert.equal(subject.material, original, 'failed mask render restores subject material')
  assert.equal(scene.background.getHex(), 0xffffff)
  assert.equal(renderer.getRenderTarget(), destination)
  assert.equal(renderer.autoClear, true)
  assert.equal(renderer.shadowMap.autoUpdate, true)
  corruption.dispose()
  destination.dispose()
}
assert.equal(DEFAULT_LENS.enabled, false)
assert.equal(DEFAULT_CRT.enabled, false)
const app = readFileSync(new URL('../src/viewer/app.ts', import.meta.url), 'utf8')
assert.ok(!app.includes('createTechnicalLens(') && !app.includes('createAnalogCRT('), 'old passes are absent from the active render path')
const gui = readFileSync(new URL('../src/viewer/debug.ts', import.meta.url), 'utf8')
assert.ok(!gui.includes('Scan Lens') && !gui.includes('Analog CRT'), 'old GUI controls remain hidden')

// Compile both actual mask variants, with the original alpha-tested texture path.
const directory = mkdtempSync(join(tmpdir(), 'box-mask-glsl-'))
const gl = {
  VERTEX_SHADER: 'vert', FRAGMENT_SHADER: 'frag', createProgram: () => ({}), createShader: type => ({ type }),
  shaderSource: (shader, text) => writeFileSync(join(directory, 'mask.' + shader.type), text),
  compileShader() {}, attachShader() {}, linkProgram() {},
}
try {
  for (const shader of maskShaders) {
    new WebGLProgram({ getContext: () => gl }, 'mask-test', {
      ...shader, defines: {}, precision: 'highp', shaderType: 'MeshBasicMaterial', shaderName: 'VisibleBoxMask',
      toneMapping: THREE.NoToneMapping, outputColorSpace: THREE.LinearSRGBColorSpace,
      numClippingPlanes: 0, numClipIntersection: 0,
      numSpotLightShadows: 0, numSpotLightMaps: 0, numSpotLightShadowsWithMaps: 0,
      map: true, mapUv: 'uv', alphaMap: true, alphaMapUv: 'uv', alphaTest: true,
      rendererExtensionParallelShaderCompile: false,
    }, {})
    execFileSync(process.argv[2] || 'glslangValidator', ['-l', join(directory, 'mask.vert'), join(directory, 'mask.frag')], { stdio: 'inherit' })
  }
} finally { if (!process.env.KEEP_MASK_GLSL) rmSync(directory, { recursive: true, force: true }); else console.log(directory) }
console.log('Rigid box capture, occlusion, cutout, state restoration, reduced motion, and mask shader checks passed.')
