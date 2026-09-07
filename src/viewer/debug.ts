import GUI from 'lil-gui'
import { applyMeltAnim, createMeltAnim, type MeltAnim, type MeltUniforms } from './melt'

export type LightLook = {
  exposure: number
  hemi: number
  key: number
  env: number
  azimuth: number
  elevation: number
  distance: number
  softness: number
  floor: string
  wall: string
}

export const DEFAULT_LIGHT: LightLook = {
  exposure: 0.86,
  hemi: 0.36,
  key: 0.38,
  env: 0.48,
  azimuth: -53,
  elevation: 42,
  distance: 5.4,
  softness: 8,
  floor: '#e4dfd4',
  wall: '#b9b8b4',
}

type DebugOptions = {
  uniforms: MeltUniforms
  anim: MeltAnim
  look: LightLook
  onLook?: () => void
  onPlay?: () => void
  onReform?: () => void
}

export function attachDebugMenu(options: DebugOptions) {
  const params = new URLSearchParams(window.location.search)
  const embed = document.body.classList.contains('embed')
  if (embed && !params.has('debug')) return null

  const { uniforms, anim, look, onLook, onPlay, onReform } = options
  const gui = new GUI({ title: 'Look' })
  gui.domElement.style.right = '12px'

  const sync = () => applyMeltAnim(uniforms, anim)
  const apply = () => onLook?.()

  const blob = gui.addFolder('Blob')
  blob.add(anim, 'progress', 0, 1, 0.001).name('progress').listen().onChange((v: number) => {
    anim.progress = v
    anim.scrubbing = true
  })
  blob.add(anim, 'blobHeight', 0.03, 0.22, 0.005).name('thickness').onChange(sync)
  blob.add(anim, 'blobPlump', 0.45, 2.2, 0.01).name('rounded').onChange(sync)
  blob.add(anim, 'blobLobes', 0, 0.95, 0.01).name('lobes').onChange(sync)
  blob.add(anim, 'blobSpeed', 0, 2.4, 0.01).name('wobble').onChange(sync)
  blob.add(anim, 'blobRadius', 0.35, 1.6, 0.01).name('spill size').onChange(sync)
  blob.add(anim, 'blobFreq', 0.6, 4, 0.01).name('lobe scale').onChange(sync)
  blob.add(anim, 'spread', 0.8, 2.0, 0.01).name('spread').onChange(sync)
  blob.add(anim, 'blobGloss', 0, 1, 0.01).name('gloss')
  blob.add(anim, 'blobClearcoat', 0, 1, 0.01).name('clearcoat')
  blob.add({ play: () => onPlay?.() }, 'play').name('Play melt')
  blob.add({ reform: () => onReform?.() }, 'reform').name('Reform')
  blob.add(
    {
      reset: () => {
        const next = createMeltAnim()
        Object.assign(anim, next)
        anim.scrubbing = true
        anim.progress = 1
        sync()
        for (const controller of blob.controllers) controller.updateDisplay()
      },
    },
    'reset',
  ).name('Reset blob')

  const light = gui.addFolder('Light')
  light.add(look, 'exposure', 0.4, 1.4, 0.01).name('exposure').onChange(apply)
  light.add(look, 'hemi', 0, 1.4, 0.01).name('hemisphere').onChange(apply)
  light.add(look, 'key', 0, 1.6, 0.01).name('key light').onChange(apply)
  light.add(look, 'env', 0, 1.6, 0.01).name('env map').onChange(apply)
  light.add(look, 'azimuth', -180, 180, 1).name('azimuth').onChange(apply)
  light.add(look, 'elevation', 8, 80, 1).name('elevation').onChange(apply)
  light.add(look, 'distance', 2, 10, 0.1).name('distance').onChange(apply)
  light.add(look, 'softness', 1, 12, 0.5).name('shadow soft').onChange(apply)
  light.addColor(look, 'floor').name('desk').onChange(apply)
  light.addColor(look, 'wall').name('wall').onChange(apply)
  light.add(
    {
      reset: () => {
        Object.assign(look, DEFAULT_LIGHT)
        apply()
        for (const controller of light.controllers) controller.updateDisplay()
      },
    },
    'reset',
  ).name('Reset lights')
  light.open()

  return gui
}
