import './styles.css'
import { startViewer } from './viewer/app'

window.__BOXPREVIEW_BOOTED = true

const params = new URLSearchParams(window.location.search)
if (params.has('embed') || params.get('embed') === '1') {
  document.body.classList.add('embed')
}

const canvas = document.querySelector('#stage')
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Missing the stage canvas')
}

void startViewer(canvas)
