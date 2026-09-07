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
    const folder = gui.addFolder('Technical Lens')
    folder.add(lens, 'enabled').name('enabled')
    folder.add(lens, 'lensSize', 120, 500, 1).name('lens size')
    folder.add(lens, 'cellSize', 8, 18, 0.5).name('cell size')
    folder.add(lens, 'surfaceDensity', 0, 0.7, 0.01).name('surface density')
    folder.add(lens, 'backgroundDensity', 0, 0.2, 0.005).name('background density')
    folder.add(lens, 'markBrightness', 0.2, 2, 0.01).name('mark brightness')
    folder.add(lens, 'vectorLength', 0.15, 0.6, 0.01).name('vector length')
    folder.add(lens, 'animSpeed', 0, 2, 0.01).name('animation speed')
    folder.add(lens, 'charSpeed', 0, 8, 0.05).name('character speed')
    folder.add(lens, 'colorSpeed', 0, 8, 0.05).name('color speed')
    folder.addColor(lens, 'colorA').name('color A')
    folder.addColor(lens, 'colorB').name('color B')
    folder.addColor(lens, 'colorC').name('color C')
    folder.add(lens, 'pulseAmount', 0, 0.5, 0.01).name('pulse amount')
    folder.add(lens, 'scanSpeed', 0, 1, 0.01).name('scan speed')
    folder.add(lens, 'scanBoost', 0, 1, 0.01).name('scan boost')
    folder.add(
      {
        reset: () => {
          Object.assign(lens, DEFAULT_LENS)
          for (const controller of folder.controllers) controller.updateDisplay()
        },
      },
      'reset',
    ).name('Reset lens')
    folder.open()
  }

  return gui
}
