import GUI from 'lil-gui'
import { type LensParams } from './technicalLens'
import { DEFAULT_CORRUPTION, type CorruptionParams } from './boxCorruption'

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
  softness: 11,
  deskSize: 5,
  floor: '#e4dfd4',
  deskGrain: 0.04,
}

type DebugOptions = {
  look: LightLook
  onLook?: () => void
  corruption?: CorruptionParams
  dots?: LensParams
}

export function attachDebugMenu(options: DebugOptions) {
  const params = new URLSearchParams(window.location.search)
  const embed = document.body.classList.contains('embed')
  if (embed && params.get('debug') !== '1') return null

  const { look, onLook, corruption, dots } = options
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

  if (corruption) {
    const folder = gui.addFolder('Box · horizontal corruption')
    folder.add(corruption, 'enabled')
    folder.add(corruption, 'squareSize', 80, 500, 1).name('cursor square · px')
    folder.add(corruption, 'surfaceDistance', 0, 12, 0.1).name('Surface distance · px')
    folder.add(corruption, 'blendAmount', 0, 1, 0.01).name('overall effect opacity')
    const edges = folder.addFolder('Surface edges')
    edges.add(corruption, 'edgeStrength', 0, 1, 0.01).name('edge highlight')
    edges.add(corruption, 'edgeWidth', 0.5, 4, 0.1).name('edge width · px')
    const hatch = folder.addFolder('Print shading')
    hatch.add(corruption, 'hatchStrength', 0, 1, 0.01).name('hatch strength')
    hatch.add(corruption, 'hatchDensity', 20, 180, 1).name('hatch density')
    hatch.add(corruption, 'hatchWidth', 0.04, 0.3, 0.01).name('ink width')
    const led = folder.addFolder('LED screen')
    led.add(corruption, 'ledEnabled').name('enabled')
    led.add(corruption, 'ledStrength', 0, 1, 0.01).name('LED strength')
    led.add(corruption, 'ledPixelSize', 2, 24, 0.01).name('subpixel spacing')
    led.add(corruption, 'ledGap', 0, 0.7, 0.01).name('gap')
    led.add(corruption, 'ledBlur', 0, 1, 0.01).name('pixel softness')
    led.add(corruption, 'ledRgbMode').name('RGB mode')
    const scanner = folder.addFolder('Scanner')
    scanner.add(corruption, 'scanlineStrength', 0, 0.5, 0.01).name('fine lines')
    scanner.add(corruption, 'scannerSweepStrength', 0, 0.6, 0.01).name('moving scanner')
    scanner.add(corruption, 'scannerSpeed', 0, 2, 0.01).name('scanner speed')
    const color = folder.addFolder('Color artifacts')
    color.add(corruption, 'colorStrength', 0, 1, 0.01).name('color strength')
    color.add(corruption, 'colorDensity', 0, 1, 0.01).name('colored fragments')
    color.add(corruption, 'colorMotionSpeed', 0, 3, 0.01).name('sideways speed')
    color.add(corruption, 'colorMotionTravel', 0, 80, 1).name('sideways travel')
    color.add(corruption, 'colorMovingDensity', 0, 1, 0.01).name('moving row fraction')
    folder.add(corruption, 'bandCoverage', 0.05, 0.35, 0.01).name('band coverage')
    folder.add(corruption, 'bandOffsetStrength', 0, 40, 0.5).name('strip offset · px')
    folder.add(corruption, 'tearAmount', 0, 1, 0.01).name('tear amount')
    folder.add(corruption, 'rgbSplitAmount', 0, 3, 0.05).name('RGB split · px')
    folder.add(corruption, 'noiseAmount', 0, 0.08, 0.001).name('band noise')
    folder.add(corruption, 'animationSpeed', 0, 2, 0.05).name('animation speed')
    folder.add({ reset: () => {
      Object.assign(corruption, DEFAULT_CORRUPTION)
      folder.controllersRecursive().forEach(control => control.updateDisplay())
    } }, 'reset').name('Reset corruption')
    folder.open()
  }
  if (dots) {
    const folder = gui.addFolder('Original dot scanner · layer')
    folder.add(dots, 'enabled')
    folder.add(dots, 'effectOpacity', 0, 1, 0.01).name('dot layer opacity')
    folder.add(dots, 'cellSize', 2.5, 12, 0.1).name('grid spacing')
    folder.add(dots, 'pointDensity', 0, 1, 0.01).name('dot density')
    folder.add(dots, 'pointSize', 0.4, 3.5, 0.05).name('dot size')
    folder.add(dots, 'effectIntensity', 0, 2, 0.01).name('intensity')
    folder.add(dots, 'flicker', 0, 1, 0.01)
    folder.add(dots, 'edgeBoost', 0, 3, 0.01).name('relief detail')
    folder.add(dots, 'scanlines', 0, 1, 0.01)
    folder.add(dots, 'glitchAmount', 0, 1, 0.01).name('broken streaks')
    folder.add(dots, 'animSpeed', 0, 3, 0.01).name('animation speed')
    folder.add(dots, 'rowFlowEnabled').name('row cycling')
    folder.add(dots, 'rowSpeed', 0, 20, 0.1).name('row speed')
    folder.add(dots, 'rowDirection', { Down: 1, Up: -1 }).name('row direction')
    folder.add(dots, 'symbols').name('symbols')
    folder.add(dots, 'symbolDensity', 0, 1, 0.01).name('symbol fraction')
    folder.add(dots, 'symbolSize', 0.4, 1, 0.01).name('symbol size')
    const palette = folder.addFolder('Five-tone palette')
    for (const [key, label] of [['shadowGreen', 'shadow'], ['midGreen', 'base'],
      ['highlightGreen', 'highlight 1'], ['highlightGold', 'highlight 2'],
      ['highlightWhite', 'highlight 3']] as const) palette.addColor(dots, key).name(label)
  }
  return gui
}
