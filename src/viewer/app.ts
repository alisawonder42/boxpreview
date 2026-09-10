import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { attachDebugMenu, DEFAULT_LIGHT, type LightLook } from './debug'
import { createBoxCorruption } from './boxCorruption'
import { createTechnicalLens } from './technicalLens'
import {
  createGround,
  findBundledScan,
  fitDesk,
  FLOOR,
  loadScanFromUrl,
  prepareLoadedScan,
} from './models'

const HOME_POSITION = new THREE.Vector3(1.75, 1.08, 2.05)
const HOME_TARGET = new THREE.Vector3(0, FLOOR + 0.42, 0)

export async function startViewer(canvas: HTMLCanvasElement) {
  const source = document.querySelector<HTMLParagraphElement>('#source')
  const hintWrap = document.querySelector('.hint')
  const reset = document.querySelector<HTMLButtonElement>('#reset')
  const drop = document.querySelector<HTMLElement>('#drop')

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = DEFAULT_LIGHT.exposure
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()

  const look: LightLook = { ...DEFAULT_LIGHT }

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(look.floor)
  scene.environment = env
  scene.environmentIntensity = look.env

  const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 48)
  camera.position.copy(HOME_POSITION)

  const hemi = new THREE.HemisphereLight('#e8e4dc', '#d8d2c8', look.hemi)
  scene.add(hemi)

  const key = new THREE.DirectionalLight('#fff4ea', look.key)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.near = 1
  key.shadow.camera.far = 14
  key.shadow.camera.left = -3.2
  key.shadow.camera.right = 3.2
  key.shadow.camera.top = 3.2
  key.shadow.camera.bottom = -3.2
  key.shadow.bias = -0.0002
  scene.add(key)

  const desk = createGround(look.deskGrain)
  scene.add(desk)

  let subject: THREE.Object3D = new THREE.Group()
  scene.add(subject)

  const applyLook = () => {
    renderer.toneMappingExposure = look.exposure
    hemi.intensity = look.hemi
    key.intensity = look.key
    scene.environmentIntensity = look.env
    const az = THREE.MathUtils.degToRad(look.azimuth)
    const el = THREE.MathUtils.degToRad(look.elevation)
    const r = look.distance
    key.position.set(
      r * Math.sin(az) * Math.cos(el),
      r * Math.sin(el),
      r * Math.cos(az) * Math.cos(el),
    )
    key.shadow.radius = look.softness
    const deskSurface = desk.userData.surface as {
      uBaseColor: { value: THREE.Color }
      uGrainStrength: { value: number }
    }
    deskSurface.uBaseColor.value.set(look.floor)
    deskSurface.uGrainStrength.value = look.deskGrain
    ;(desk.material as THREE.MeshStandardMaterial).color.set(look.floor)
    scene.background = new THREE.Color(look.floor)
    if (subject) fitDesk(desk, subject, look.deskSize)
  }
  applyLook()

  // Original dot scanner is an optional captured layer; analog CRT stays archived.
  const dots = createTechnicalLens(renderer)
  dots.params.borderOpacity = 0
  Object.assign(dots.params, {
    enabled: true, effectOpacity: 0.27, cellSize: 4.4, pointDensity: 0.52,
    pointSize: 1.4, effectIntensity: 1.45, flicker: 0.64, edgeBoost: 1.39,
    scanlines: 0.77, glitchAmount: 0.28, animSpeed: 2, rowFlowEnabled: false,
    rowSpeed: 0, rowDirection: 1, symbols: '1', symbolDensity: 0.03, symbolSize: 0.55,
  })
  dots.setSubject(subject)
  const corruption = createBoxCorruption(renderer)
  corruption.setSubject(subject)
  const clock = new THREE.Clock()

  const controls = new OrbitControls(camera, canvas)
  controls.enablePan = false
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 1.2
  controls.maxDistance = 4.6
  controls.minPolarAngle = 0.72
  controls.maxPolarAngle = 1.42
  controls.target.copy(HOME_TARGET)
  controls.update()

  const pointerPixels = new THREE.Vector2(-1, -1)
  const pointerNDC = new THREE.Vector2(0, 0)

  const setSource = (text: string) => {
    if (source) source.textContent = text
  }

  const replaceSubject = (next: THREE.Object3D, label: string) => {
    scene.remove(subject)
    subject = next
    scene.add(subject)
    corruption.setSubject(subject)
    dots.setSubject(subject)
    fitDesk(desk, subject, look.deskSize)
    setSource(label)
  }

  attachDebugMenu({ look, onLook: applyLook, corruption: corruption.params, dots: dots.params })

  const hideHint = () => hintWrap?.classList.add('is-hidden')

  const onPointerMove = (event: PointerEvent) => {
    dots.setPointer(event.clientX, event.clientY)
    dots.setPointerActive(true)
    corruption.setPointer(event.clientX, event.clientY)
    pointerPixels.set(event.clientX, event.clientY)
    pointerNDC.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1,
    )
  }
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerdown', onPointerMove)
  const clearPointer = () => { corruption.clearPointer(); dots.setPointerActive(false) }
  canvas.addEventListener('pointerleave', clearPointer)
  canvas.addEventListener('pointercancel', clearPointer)
  window.addEventListener('blur', clearPointer)
  canvas.addEventListener('pointerdown', hideHint)

  reset?.addEventListener('click', () => {
    camera.position.copy(HOME_POSITION)
    controls.target.copy(HOME_TARGET)
    controls.update()
  })

  const loadFile = async (file: File) => {
    const url = URL.createObjectURL(file)
    setSource(`Loading ${file.name}…`)
    try {
      const root = await loadScanFromUrl(url, file.name)
      prepareLoadedScan(root, renderer.capabilities.getMaxAnisotropy())
      replaceSubject(root, `Scan · ${file.name}`)
    } catch (error) {
      setSource('Could not read that file')
      console.error(error)
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  window.addEventListener('dragover', (event) => {
    event.preventDefault()
    drop?.removeAttribute('hidden')
  })
  window.addEventListener('dragleave', () => drop?.setAttribute('hidden', ''))
  window.addEventListener('drop', (event) => {
    event.preventDefault()
    drop?.setAttribute('hidden', '')
    const file = event.dataTransfer?.files[0]
    if (file) void loadFile(file)
  })

  window.addEventListener('resize', () => {
    const w = window.innerWidth
    const h = window.innerHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    corruption.resize()
    dots.resize()
  })

  const loop = () => {
    requestAnimationFrame(loop)
    controls.update()
    canvas.dataset.pointer = `${pointerNDC.x.toFixed(3)},${pointerNDC.y.toFixed(3)}`
    canvas.dataset.pointerPx = `${pointerPixels.x.toFixed(0)},${pointerPixels.y.toFixed(0)}`
    const elapsed = clock.getElapsedTime()
    dots.params.lensSize = corruption.params.squareSize
    const dotOpacity = dots.params.enabled ? dots.params.effectOpacity : 0
    if (dotOpacity > 0) dots.render(scene, camera, elapsed, true)
    corruption.setDots(dots.getLayerTexture(), dotOpacity)
    corruption.render(scene, camera, elapsed)
  }
  loop()
  document.body.classList.add('ready')

  try {
    setSource('Loading scan…')
    const bundled = await findBundledScan()
    if (!bundled) {
      setSource('No scan found')
      return
    }
    prepareLoadedScan(bundled.root, renderer.capabilities.getMaxAnisotropy())
    const name = bundled.url.split('/').pop() || bundled.url
    replaceSubject(bundled.root, `Scan · ${name}`)
  } catch (error) {
    console.error(error)
    setSource('Could not load scan')
  }
}
