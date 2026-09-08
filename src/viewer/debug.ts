import GUI from 'lil-gui'
import { DEFAULT_LENS, type LensParams } from './technicalLens'

export type LightLook = {
  exposure: number
  hemi: number
  key: number
  env: number
  azimuth: number
  elevation: number
  distance: number
  softness: number
  deskSize: number
  floor: string
  deskGrain: number
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
  deskSize: 5,
  floor: '#e4dfd4',
  deskGrain: 0.04,
}

type DebugOptions = {
  look: LightLook
  onLook?: () => void
  lens?: LensParams
}

export function attachDebugMenu(options: DebugOptions) {
  const params = new URLSearchParams(window.location.search)
  const embed = document.body.classList.contains('embed')
  if (embed && params.get('debug') !== '1') return null

  const { look, onLook, lens } = options
  const gui = new GUI({ title: 'Look' })
  gui.domElement.classList.add('debug-gui')
  gui.domElement.style.right = '12px'

  const apply = () => onLook?.()

  gui.add(look, 'exposure', 0.4, 1.4, 0.01).name('exposure').onChange(apply)
  gui.add(look, 'hemi', 0, 1.4, 0.01).name('hemisphere').onChange(apply)
  gui.add(look, 'key', 0, 1.6, 0.01).name('key light').onChange(apply)
  gui.add(look, 'env', 0, 1.6, 0.01).name('environment').onChange(apply)
  gui.add(look, 'azimuth', -180, 180, 1).name('light azimuth').onChange(apply)
  gui.add(look, 'elevation', 8, 80, 1).name('light elevation').onChange(apply)
  gui.add(look, 'distance', 2, 10, 0.1).name('light distance').onChange(apply)
  gui.add(look, 'softness', 1, 12, 0.5).name('shadow softness').onChange(apply)
  gui.add(look, 'deskSize', 2, 10, 0.1).name('desk size').onChange(apply)
  gui.addColor(look, 'floor').name('desk color').onChange(apply)
  gui.add(look, 'deskGrain', 0, 0.16, 0.001).name('desk grain').onChange(apply)
  gui.add(
    {
      reset: () => {
        Object.assign(look, DEFAULT_LIGHT)
        apply()
        for (const controller of gui.controllers) controller.updateDisplay()
      },
    },
    'reset',
  ).name('Reset lights')

  if (lens) {
    const folder = gui.addFolder('Scan Lens')
    folder.add(lens, 'enabled').name('enabled')
    folder.add(lens, 'lensSize', 120, 600, 1).name('lens size')

    const points = folder.addFolder('Reconstruction')
    points.add(lens, 'cellSize', 2.5, 10, 0.1).name('cell size')
    points.add(lens, 'pointSize', 0.4, 3.5, 0.05).name('point size')
    points.add(lens, 'pointDensity', 0.2, 1, 0.01).name('point density')
    points.add(lens, 'flicker', 0, 0.8, 0.01).name('flicker')
    points.add(lens, 'edgeBoost', 0, 3, 0.01).name('edge boost')
    points.add(lens, 'surfaceRoughness', 0.12, 0.7, 0.01).name('surface roughness')
    points.open()

    const glitch = folder.addFolder('Glitch')
    glitch.add(lens, 'glitchAmount', 0, 1, 0.01).name('glitch amount')
    glitch.add(lens, 'glitchFrequency', 0.05, 2, 0.01).name('glitch frequency')
    glitch.add(lens, 'glitchShift', 0, 40, 0.5).name('glitch shift')
    glitch.add(lens, 'scanlines', 0, 1, 0.01).name('scanlines')
    glitch.add(lens, 'animSpeed', 0, 2, 0.01).name('animation speed')

    const color = folder.addFolder('Color')
    color.addColor(lens, 'shadowGreen').name('shadow')
    color.addColor(lens, 'midGreen').name('base')
    color.addColor(lens, 'highlightGreen').name('highlight 1 · mint')
    color.addColor(lens, 'highlightGold').name('highlight 2 · gold')
    color.addColor(lens, 'highlightWhite').name('highlight 3 · white')
    color.add(lens, 'shadowThreshold', 0.05, 0.6, 0.01).name('shadow threshold')
    color.add(lens, 'highlightThreshold', 0.4, 0.95, 0.01).name('highlight threshold')
    color.open()

    const mix = folder.addFolder('Window')
    mix.add(lens, 'baseDarken', 0, 1, 0.01).name('base darken')
    mix.add(lens, 'effectIntensity', 0.2, 2.5, 0.01).name('effect intensity')
    mix.add(lens, 'borderOpacity', 0, 1, 0.01).name('border opacity')

    const bloom = folder.addFolder('Bloom')
    bloom.add(lens, 'bloomStrength', 0, 1, 0.01).name('strength')
    bloom.add(lens, 'bloomRadius', 1, 14, 0.5).name('radius')
    bloom.add(lens, 'bloomThreshold', 0.2, 0.95, 0.01).name('threshold')
    bloom.add(lens, 'grainStrength', 0, 0.15, 0.005).name('film grain')

    folder.add(
      {
        reset: () => {
          Object.assign(lens, DEFAULT_LENS)
          for (const controller of folder.controllersRecursive()) controller.updateDisplay()
        },
      },
      'reset',
    ).name('Reset lens')
    folder.open()
  }

  return gui
}
