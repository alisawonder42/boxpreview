import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createTechnicalLens } from '../src/viewer/technicalLens.ts'

globalThis.window = { matchMedia: () => ({ matches: false }) }

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
    render: (object) => calls.push({ object, target, autoClear: renderer.autoClear, scissorTest, scissor: scissor.clone() }),
  }
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('white')
  const subject = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial())
  scene.add(subject, floor)
  const lens = createTechnicalLens(renderer)
  lens.setSubject(subject)
  return { renderer, lens, scene, floor, calls }
}

for (const ratio of [1, 1.5, 2]) {
  const { renderer, lens, scene, floor, calls } = setup(ratio)
  const camera = new THREE.PerspectiveCamera()
  lens.render(scene, camera, 0)
  assert.equal(calls.length, 1, 'inactive lens renders only the original scene')
  calls.length = 0
  lens.setPointer(400, 300)
  lens.setPointerActive(true)
  lens.render(scene, camera, 1)
  assert.equal(calls.length, 4)
  assert.equal(calls[0].target, null, 'original scene is rendered directly first')
  for (const call of calls.slice(1, 3)) {
    assert.equal(call.target.texture.type, THREE.UnsignedByteType)
    assert.equal(call.target.samples, 0)
  }
  const overlay = calls[3]
  assert.equal(overlay.target, null)
  assert.equal(overlay.autoClear, false, 'overlay cannot clear the original view')
  assert.equal(overlay.scissorTest, true)
  const [x, y, width, height] = overlay.scissor.toArray()
  assert.ok(Math.abs(x - 248) <= 1 && Math.abs(y - 148) <= 1)
  assert.ok(width <= 304 && height <= 304, 'effect stays within the 300px square plus border')
  assert.equal(renderer.autoClear, true)
  assert.equal(renderer.getScissorTest(), false)
  assert.equal(renderer.shadowMap.autoUpdate, true)
  assert.equal(floor.visible, true)
  assert.equal(scene.background.getHex(), 0xffffff)
  lens.setPointer(0, 0)
  lens.render(scene, camera, 2)
  const edge = calls.at(-1).scissor
  assert.equal(edge.x, 0)
  assert.ok(edge.y + edge.w <= 600, 'square is clipped at the canvas edge')
  lens.dispose()
}

// A failed overlay must still restore state for the next normal frame.
{
  const { renderer, lens, scene } = setup()
  const render = renderer.render
  renderer.render = (object) => {
    if (object instanceof THREE.Mesh) throw new Error('Composite failure')
    render(object)
  }
  lens.setPointer(400, 300)
  lens.setPointerActive(true)
  assert.throws(() => lens.render(scene, new THREE.PerspectiveCamera(), 1), /Composite failure/)
  assert.equal(renderer.autoClear, true)
  assert.equal(renderer.getScissorTest(), false)
  assert.equal(renderer.getRenderTarget(), null)
  lens.dispose()
}
console.log('Lens render regression checks passed: normal pass, square clipping, DPI, targets, state restoration.')
