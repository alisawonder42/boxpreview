import GUI from 'lil-gui'
import { DEFAULT_LENS, type LensParams } from './technicalLens'
import { DEFAULT_CRT, type CRTParams } from './analogCRT'

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
  crt?: CRTParams
}

export function attachDebugMenu(options: DebugOptions) {
  const params = new URLSearchParams(window.location.search)
  const embed = document.body.classList.contains('embed')
  if (embed && params.get('debug') !== '1') return null

  const { look, onLook, lens, crt } = options
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
    points.add(lens, 'pointDensity', 0, 1, 0.01).name('point density')
    points.add(lens, 'flicker', 0, 0.8, 0.01).name('flicker')
    points.add(lens, 'edgeBoost', 0, 3, 0.01).name('edge boost')
    points.add(lens, 'surfaceRoughness', 0.12, 0.7, 0.01).name('surface roughness')
    points.open()

    const motion = folder.addFolder('Row flow')
    motion.add(lens, 'rowFlowEnabled').name('enabled')
    motion.add(lens, 'rowSpeed', 0, 20, 0.1).name('rows per second')
    motion.add(lens, 'rowDirection', { Down: 1, Up: -1 }).name('direction')
    motion.open()

    const symbols = folder.addFolder('Symbols')
    symbols.add(lens, 'symbols').name('characters')
    symbols.add(lens, 'symbolDensity', 0, 1, 0.01).name('symbol density')
    symbols.add(lens, 'symbolSize', 0.4, 1, 0.01).name('symbol size')
    symbols.add(lens, 'symbolChangeSpeed', 0, 3, 0.1).name('change speed')
    symbols.open()

    const glitch = folder.addFolder('Glitch')
    glitch.add(lens, 'glitchAmount', 0, 1, 0.01).name('glitch amount')
    glitch.add(lens, 'glitchFrequency', 0.05, 2, 0.01).name('glitch frequency')
    glitch.add(lens, 'glitchShift', 0, 40, 0.5).name('glitch shift')
    glitch.add(lens, 'scanlines', 0, 1, 0.01).name('scanlines')
    glitch.add(lens, 'animSpeed', 0, 2, 0.01).name('animation speed')

    const color = folder.addFolder('Color')
    color.addColor(lens, 'shadowGreen').name('shadow')
    color.addColor(lens, 'midGreen').name('base')
    color.addColor(lens, 'highlightGreen').name('highlight 1')
    color.addColor(lens, 'highlightGold').name('highlight 2')
    color.addColor(lens, 'highlightWhite').name('highlight 3')
    color.add(lens, 'shadowThreshold', 0.05, 0.6, 0.01).name('shadow threshold')
    color.add(lens, 'highlightThreshold', 0.4, 0.95, 0.01).name('highlight threshold')
    color.open()

    const mix = folder.addFolder('Window')
    mix.add(lens, 'baseDarken', 0, 1, 0.01).name('base darken')
    mix.add(lens, 'effectIntensity', 0.2, 2.5, 0.01).name('effect intensity')
    mix.add(lens, 'borderOpacity', 0, 1, 0.01).name('border opacity')


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

  if (crt) {
    const folder = gui.addFolder('Analog CRT · final frame')
    folder.add(crt, 'enabled')
    folder.add(crt, 'strength', 0, 1, 0.01)
    folder.add(crt, 'lineSpacing', 1.5, 8, 0.1).name('vertical line spacing')
    folder.add(crt, 'lineStrength', 0, 0.8, 0.01).name('line contrast')
    folder.add(crt, 'lineIrregularity', 0, 1, 0.01).name('line irregularity')
    folder.add(crt, 'calmDisplacement', 0, 3, 0.05).name('calm shift · px')
    folder.add(crt, 'largeDisplacement', 0, 100, 1).name('large bends · px')
    folder.add(crt, 'mediumDisplacement', 0, 50, 0.5).name('medium bends · px')
    folder.add(crt, 'jitter', 0, 4, 0.05).name('fine jitter · px')
    folder.add(crt, 'rowStep', 1, 16, 1).name('terrace height · px')
    folder.add(crt, 'tearStrength', 0, 150, 1).name('tracking tear · px')
    folder.add(crt, 'tearWidth', 0.005, 0.2, 0.005).name('tear height')
    folder.add(crt, 'rgbSeparation', 0, 8, 0.1).name('RGB separation · px')
    folder.add(crt, 'burstRate', 0, 2, 0.05).name('bursts per second')
    folder.add(crt, 'burstDuration', 0.05, 0.6, 0.01).name('burst duration · s')
    folder.add(crt, 'settleTime', 0.05, 1, 0.01).name('settle time · s')
    folder.add(crt, 'amplitudeVariation', 0, 0.3, 0.01).name('brightness variation')
    folder.add({ reset: () => {
      Object.assign(crt, DEFAULT_CRT)
      folder.controllersRecursive().forEach(control => control.updateDisplay())
    } }, 'reset').name('Reset analog CRT')
    folder.open()
  }
  return gui
}
