import GUI from 'lil-gui'
import type * as THREE from 'three'
import {
  applyMeltAnim,
  createMeltAnim,
  type MeltAnim,
  type MeltUniforms,
} from './melt'

export type LightRig = {
  ambient: THREE.AmbientLight
  hemi: THREE.HemisphereLight
  windowDiffuse: THREE.RectAreaLight
  skyDiffuse: THREE.RectAreaLight
  direct: THREE.DirectionalLight
  fill: THREE.DirectionalLight
}

type DebugOptions = {
  renderer: THREE.WebGLRenderer
  rig: LightRig
  uniforms: MeltUniforms
  anim: MeltAnim
  gtao: { blendIntensity: number }
  controls: { autoRotate: boolean; autoRotateSpeed: number }
  onPlay?: () => void
  onReform?: () => void
}

export function attachDebugMenu(options: DebugOptions) {
  const params = new URLSearchParams(window.location.search)
  const embed = document.body.classList.contains('embed')
  if (embed && !params.has('debug')) return null

  const { renderer, rig, uniforms, anim, gtao, controls, onPlay, onReform } = options
  const gui = new GUI({ title: 'Look' })
  gui.domElement.style.right = '12px'

  const state = {
    exposure: renderer.toneMappingExposure,
    ambient: rig.ambient.intensity,
    hemi: rig.hemi.intensity,
    windowDiffuse: rig.windowDiffuse.intensity,
    skyDiffuse: rig.skyDiffuse.intensity,
    direct: rig.direct.intensity,
    fill: rig.fill.intensity,
    shadowSoft: rig.direct.shadow.radius,
    lift: uniforms.uLift.value,
    gamma: uniforms.uGamma.value,
    ao: gtao.blendIntensity,
    autoRotate: controls.autoRotate,
    spin: controls.autoRotateSpeed,
  }

  const animation = gui.addFolder('Animation')
  animation.open()
  animation.add(anim, 'progress', 0, 1, 0.001).name('progress').listen().onChange((v: number) => {
    anim.progress = v
    anim.scrubbing = true
  })
  animation.add(anim, 'meltIn', 0.15, 4, 0.01).name('melt in')
  animation.add(anim, 'meltOut', 0.15, 6, 0.01).name('melt out')
  animation.add(anim, 'ease', 0.4, 2.4, 0.01).name('slow start')
  animation.add(anim, 'sagEnd', 0.05, 0.9, 0.01).name('sag end').onChange(() => applyMeltAnim(uniforms, anim))
  animation.add(anim, 'flattenStart', 0, 0.9, 0.01).name('flatten start').onChange(() => applyMeltAnim(uniforms, anim))
  animation.add(anim, 'flattenEnd', 0.05, 1, 0.01).name('flatten end').onChange(() => applyMeltAnim(uniforms, anim))
  animation.add(anim, 'drainStart', 0, 0.95, 0.01).name('drain start').onChange(() => applyMeltAnim(uniforms, anim))
  animation.add(anim, 'drainEnd', 0.2, 1, 0.01).name('drain end').onChange(() => applyMeltAnim(uniforms, anim))
  animation.add(anim, 'fadeStart', 0, 0.95, 0.01).name('fade start').onChange(() => applyMeltAnim(uniforms, anim))
  animation.add(anim, 'fadeEnd', 0.2, 1, 0.01).name('fade end').onChange(() => applyMeltAnim(uniforms, anim))
  animation.add(anim, 'spread', 1, 2.4, 0.01).onChange(() => applyMeltAnim(uniforms, anim))
  animation.add(anim, 'drainTravel', 0.4, 4, 0.01).name('drain travel').onChange(() => applyMeltAnim(uniforms, anim))
  animation.add(anim, 'puddleInStart', 0, 0.8, 0.01).name('puddle in')
  animation.add(anim, 'puddleInEnd', 0.05, 1, 0.01).name('puddle full')
  animation.add(anim, 'puddleOutStart', 0, 0.95, 0.01).name('puddle leave')
  animation.add(anim, 'puddleOutEnd', 0.2, 1, 0.01).name('puddle gone')
  animation.add({ play: () => onPlay?.() }, 'play').name('Play melt')
  animation.add({ reform: () => onReform?.() }, 'reform').name('Reform')
  animation.add(
    {
      reset: () => {
        Object.assign(anim, createMeltAnim())
        applyMeltAnim(uniforms, anim)
        for (const controller of animation.controllers) controller.updateDisplay()
      },
    },
    'reset',
  ).name('Reset animation')

  const diffuse = gui.addFolder('Diffuse')
  diffuse.add(state, 'ambient', 0, 3, 0.01).onChange((v: number) => {
    rig.ambient.intensity = v
  })
  diffuse.add(state, 'hemi', 0, 3, 0.01).onChange((v: number) => {
    rig.hemi.intensity = v
  })
  diffuse.add(state, 'windowDiffuse', 0, 16, 0.1).name('window area').onChange((v: number) => {
    rig.windowDiffuse.intensity = v
  })
  diffuse.add(state, 'skyDiffuse', 0, 12, 0.1).name('sky area').onChange((v: number) => {
    rig.skyDiffuse.intensity = v
  })

  const direct = gui.addFolder('Direct')
  direct.add(state, 'direct', 0, 3, 0.01).name('sun / window').onChange((v: number) => {
    rig.direct.intensity = v
  })
  direct.add(state, 'fill', 0, 2, 0.01).onChange((v: number) => {
    rig.fill.intensity = v
  })
  direct.add(state, 'shadowSoft', 0, 24, 0.5).name('shadow soft').onChange((v: number) => {
    rig.direct.shadow.radius = v
  })

  const surface = gui.addFolder('Surface')
  surface.add(state, 'lift', 0.5, 2.6, 0.01).name('print lift').onChange((v: number) => {
    uniforms.uLift.value = v
  })
  surface.add(state, 'gamma', 0.5, 1.2, 0.01).name('print gamma').onChange((v: number) => {
    uniforms.uGamma.value = v
  })
  surface.add(state, 'exposure', 0.4, 2, 0.01).onChange((v: number) => {
    renderer.toneMappingExposure = v
  })
  surface.add(state, 'ao', 0, 1, 0.01).onChange((v: number) => {
    gtao.blendIntensity = v
  })

  const motion = gui.addFolder('Motion')
  motion.add(state, 'autoRotate').onChange((v: boolean) => {
    controls.autoRotate = v
  })
  motion.add(state, 'spin', 0, 2, 0.01).onChange((v: number) => {
    controls.autoRotateSpeed = v
  })

  gui.add(
    {
      copy: () => {
        const { progress: _progress, scrubbing: _scrubbing, ...timing } = anim
        void navigator.clipboard.writeText(JSON.stringify({ ...state, animation: timing }, null, 2))
      },
    },
    'copy',
  ).name('Copy settings JSON')

  return gui
}
