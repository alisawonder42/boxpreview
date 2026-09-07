import GUI from 'lil-gui'
import { applyMeltAnim, createMeltAnim, type MeltAnim, type MeltUniforms } from './melt'

type DebugOptions = {
  uniforms: MeltUniforms
  anim: MeltAnim
  onPlay?: () => void
  onReform?: () => void
}

export function attachDebugMenu(options: DebugOptions) {
  const params = new URLSearchParams(window.location.search)
  const embed = document.body.classList.contains('embed')
  if (embed && !params.has('debug')) return null

  const { uniforms, anim, onPlay, onReform } = options
  const gui = new GUI({ title: 'Blob' })
  gui.domElement.style.right = '12px'

  const sync = () => applyMeltAnim(uniforms, anim)

  gui.add(anim, 'progress', 0, 1, 0.001).name('progress').listen().onChange((v: number) => {
    anim.progress = v
    anim.scrubbing = true
  })
  gui.add(anim, 'blobHeight', 0.03, 0.22, 0.005).name('thickness').onChange(sync)
  gui.add(anim, 'blobPlump', 0.45, 2.2, 0.01).name('rounded').onChange(sync)
  gui.add(anim, 'blobLobes', 0, 0.95, 0.01).name('lobes').onChange(sync)
  gui.add(anim, 'blobSpeed', 0, 2.4, 0.01).name('wobble').onChange(sync)
  gui.add(anim, 'blobRadius', 0.35, 1.6, 0.01).name('spill size').onChange(sync)
  gui.add(anim, 'blobFreq', 0.6, 4, 0.01).name('lobe scale').onChange(sync)
  gui.add(anim, 'spread', 0.8, 2.0, 0.01).name('spread').onChange(sync)
  gui.add(anim, 'blobGloss', 0, 1, 0.01).name('gloss')
  gui.add(anim, 'blobClearcoat', 0, 1, 0.01).name('clearcoat')
  gui.add({ play: () => onPlay?.() }, 'play').name('Play melt')
  gui.add({ reform: () => onReform?.() }, 'reform').name('Reform')
  gui.add(
    {
      reset: () => {
        const next = createMeltAnim()
        Object.assign(anim, next)
        anim.scrubbing = true
        anim.progress = 1
        sync()
        for (const controller of gui.controllers) controller.updateDisplay()
      },
    },
    'reset',
  ).name('Reset blob')

  return gui
}
