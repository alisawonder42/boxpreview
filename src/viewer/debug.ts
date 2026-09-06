import GUI from 'lil-gui'
import type * as THREE from 'three'
import type { MeltUniforms } from './melt'

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
  gtao: { blendIntensity: number }
  controls: { autoRotate: boolean; autoRotateSpeed: number }
}

export function attachDebugMenu(options: DebugOptions) {
  const params = new URLSearchParams(window.location.search)
  const embed = document.body.classList.contains('embed')
  if (embed && !params.has('debug')) return null

  const { renderer, rig, uniforms, gtao, controls } = options
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
        void navigator.clipboard.writeText(JSON.stringify(state, null, 2))
      },
    },
    'copy',
  ).name('Copy settings JSON')

  return gui
}
