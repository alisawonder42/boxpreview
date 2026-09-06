import * as THREE from 'three'

function rand(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function spot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot: number,
  fill: string,
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.beginPath()
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.restore()
}

export function createAnimalPrintTexture(size = 1024) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not paint the print')

  const wash = ctx.createLinearGradient(0, 0, size, size)
  wash.addColorStop(0, '#d8b07a')
  wash.addColorStop(0.45, '#c89458')
  wash.addColorStop(1, '#a56c38')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, size, size)

  for (let i = 0; i < 1400; i++) {
    const x = rand(i + 1) * size
    const y = rand(i + 9) * size
    ctx.fillStyle = `rgba(80, 42, 18, ${0.035 + rand(i + 3) * 0.05})`
    ctx.fillRect(x, y, 1.4, 1.4)
  }

  for (let i = 0; i < 86; i++) {
    const x = rand(i + 21) * size
    const y = rand(i + 47) * size
    const rx = 18 + rand(i + 8) * 46
    const ry = 14 + rand(i + 11) * 34
    const rot = rand(i + 15) * Math.PI
    spot(ctx, x, y, rx * 1.18, ry * 1.18, rot, 'rgba(92, 48, 18, 0.22)')
    spot(ctx, x, y, rx, ry, rot, '#2a160c')
    spot(ctx, x - rx * 0.12, y - ry * 0.1, rx * 0.55, ry * 0.48, rot, '#4a2812')
    if (rand(i + 70) > 0.35) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rot)
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.ellipse(rx * 0.08, -ry * 0.04, rx * 0.38, ry * 0.32, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      ctx.globalCompositeOperation = 'source-over'
    }
  }

  for (let i = 0; i < 40; i++) {
    const x = rand(i + 200) * size
    const y = rand(i + 260) * size
    spot(ctx, x, y, 6 + rand(i) * 10, 4 + rand(i + 2) * 8, rand(i + 4) * Math.PI, '#1b100a')
  }

  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8
  map.wrapS = THREE.RepeatWrapping
  map.wrapT = THREE.RepeatWrapping

  const bumpCanvas = document.createElement('canvas')
  bumpCanvas.width = size
  bumpCanvas.height = size
  const bctx = bumpCanvas.getContext('2d')
  if (bctx) {
    bctx.filter = 'grayscale(1) contrast(1.25)'
    bctx.drawImage(canvas, 0, 0)
  }
  const bump = new THREE.CanvasTexture(bumpCanvas)
  bump.wrapS = THREE.RepeatWrapping
  bump.wrapT = THREE.RepeatWrapping

  return { map, bump }
}
