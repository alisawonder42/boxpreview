import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'
import {
  bindMeltBounds,
  createMeltUniforms,
  setMeltLook,
} from './melt'
import {
  createGround,
  createPuddle,
  createStandInBox,
  findBundledScan,
  firstAlbedo,
  loadScanFromUrl,
  prepareLoadedScan,
  FLOOR,
} from './models'
import { createDrips } from './drips'
import { createPost } from './post'
import { attachDebugMenu } from './debug'

const HOLD_MS = 340
const MOVE_PX = 7

export async function startViewer(canvas: HTMLCanvasElement) {
  const source = document.querySelector<HTMLParagraphElement>('#source')
  const hint = document.querySelector<HTMLElement>('[data-hint]')
  const hintWrap = document.querySelector('.hint')
  const reset = document.querySelector<HTMLButtonElement>('#reset')
  const drop = document.querySelector<HTMLElement>('#drop')

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#f4f1ea')
  scene.fog = new THREE.Fog('#f4f1ea', 7, 16)

  const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 40)
  camera.position.set(1.85, 1.15, 2.2)

  RectAreaLightUniformsLib.init()

  const ambient = new THREE.AmbientLight('#f6efe4', 1.67)
  const hemi = new THREE.HemisphereLight('#fff8ef', '#e8dccb', 0)
  scene.add(ambient, hemi)

  const windowDiffuse = new THREE.RectAreaLight('#fff6ea', 3.4, 8, 5)
  windowDiffuse.position.set(-3.6, 2.6, 1.4)
  windowDiffuse.lookAt(0, 0.4, 0)
  scene.add(windowDiffuse)

  const skyDiffuse = new THREE.RectAreaLight('#fffaf3', 0.6, 10, 6)
  skyDiffuse.position.set(0.2, 5.2, 0.4)
  skyDiffuse.lookAt(0, 0.3, 0)
  scene.add(skyDiffuse)

  const direct = new THREE.DirectionalLight('#fff6ea', 2.26)
  direct.position.set(-3.2, 3.8, 2.4)
  direct.castShadow = true
  direct.shadow.mapSize.set(2048, 2048)
  direct.shadow.camera.near = 1
  direct.shadow.camera.far = 16
  direct.shadow.camera.left = -4
  direct.shadow.camera.right = 4
  direct.shadow.camera.top = 4
  direct.shadow.camera.bottom = -4
  direct.shadow.radius = 8
  direct.shadow.bias = -0.00015
  scene.add(direct)

  const fill = new THREE.DirectionalLight('#f3ebe0', 0)
  fill.position.set(2.8, 1.8, -1.4)
  scene.add(fill)

  scene.add(createGround())

  const uniforms = createMeltUniforms()
  let subject: THREE.Object3D = createStandInBox(uniforms)
  scene.add(subject)
  bindMeltBounds(subject, uniforms)

  let puddle = createPuddle(firstAlbedo(subject))
  scene.add(puddle)
  let drips = createDrips(firstAlbedo(subject))
  scene.add(drips.mesh)

  const setSource = (text: string) => {
    if (source) source.textContent = text
  }
  setSource('Stand-in box — drop your scan to replace it')

  const replaceSubject = (next: THREE.Object3D, label: string) => {
    scene.remove(subject)
    subject = next
    scene.add(subject)
    bindMeltBounds(subject, uniforms)
    const map = firstAlbedo(subject)
    scene.remove(puddle)
    puddle = createPuddle(map)
    scene.add(puddle)
    drips.setMap(map)
    setSource(label)
  }

  const bundled = await findBundledScan()
  if (bundled) {
    prepareLoadedScan(bundled.root, uniforms)
    replaceSubject(bundled.root, `Scan · ${bundled.url.replace('./models/', '')}`)
  }

  const controls = new OrbitControls(camera, canvas)
  controls.enablePan = false
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 1.6
  controls.maxDistance = 4.6
  controls.minPolarAngle = 0.72
  controls.maxPolarAngle = 1.42
  controls.autoRotate = false
  controls.autoRotateSpeed = 0
  controls.target.set(0, FLOOR + 0.42, 0)
  const home = {
    position: camera.position.clone(),
    target: controls.target.clone(),
  }

  const post = createPost(renderer, scene, camera)

  attachDebugMenu({
    renderer,
    rig: { ambient, hemi, windowDiffuse, skyDiffuse, direct, fill },
    uniforms,
    gtao: post.gtao,
    controls,
  })

  const clock = new THREE.Clock()
  let melt = 0
  let meltTarget = 0
  let holding = false
  let holdTimer = 0
  let pointer = new THREE.Vector2()
  let down = new THREE.Vector2()
  let hintGone = false

  const raycaster = new THREE.Raycaster()
  const hitsSubject = (clientX: number, clientY: number) => {
    pointer.x = (clientX / window.innerWidth) * 2 - 1
    pointer.y = -(clientY / window.innerHeight) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    return raycaster.intersectObject(subject, true).length > 0
  }

  const hideHint = () => {
    if (hintGone) return
    hintGone = true
    hintWrap?.classList.add('is-hidden')
  }

  canvas.addEventListener('pointerdown', (event) => {
    down.set(event.clientX, event.clientY)
    holding = hitsSubject(event.clientX, event.clientY)
    holdTimer = 0
    controls.autoRotate = false
    hideHint()
  })

  canvas.addEventListener('pointermove', (event) => {
    if (holding && down.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > MOVE_PX) {
      holding = false
      meltTarget = 0
    }
  })

  const endHold = () => {
    holding = false
    meltTarget = 0
  }
  canvas.addEventListener('pointerup', endHold)
  canvas.addEventListener('pointercancel', endHold)
  canvas.addEventListener('pointerleave', endHold)

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
      event.preventDefault()
      meltTarget = 1
      hideHint()
    }
  })
  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space') meltTarget = 0
  })

  reset?.addEventListener('click', () => {
    camera.position.copy(home.position)
    controls.target.copy(home.target)
    melt = 0
    meltTarget = 0
  })

  const loadFile = async (file: File) => {
    const url = URL.createObjectURL(file)
    setSource(`Loading ${file.name}…`)
    try {
      const root = await loadScanFromUrl(url, file.name)
      prepareLoadedScan(root, uniforms)
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
    post.resize(w, h)
  })

  const loop = () => {
    const dt = clock.getDelta()
    uniforms.uTime.value = clock.elapsedTime
    if (holding) {
      holdTimer += dt * 1000
      if (holdTimer > HOLD_MS) meltTarget = 1
    }
    melt = THREE.MathUtils.damp(melt, meltTarget, 2.4, dt)
    uniforms.uMelt.value = melt
    setMeltLook(subject, melt)
    post.setMeltBloom(melt)

    const box = new THREE.Box3().setFromObject(subject)
    const origin = new THREE.Vector3()
    box.getCenter(origin)
    origin.y = box.min.y + 0.12
    drips.update(melt, clock.elapsedTime, origin)

    const puddleMat = puddle.material as THREE.MeshPhysicalMaterial
    puddle.visible = melt > 0.04
    puddle.scale.setScalar(0.35 + melt * 1.15)
    puddleMat.opacity = THREE.MathUtils.clamp(melt * 1.15, 0, 0.92)

    if (hint) {
      hint.textContent = melt > 0.08 ? 'Release to gather itself' : 'Drag to turn · Hold to unmake'
    }

    controls.update()
    post.composer.render()
    requestAnimationFrame(loop)
  }

  loop()
}
