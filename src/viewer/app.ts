import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'
import {
  applyMeltAnim,
  bindMeltBounds,
  createMeltAnim,
  createMeltUniforms,
  setMeltLook,
  visualMelt,
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
import { createPost } from './post'
import { attachDebugMenu } from './debug'
import { createIntro, INTRO_HOME, shouldSkipIntro } from './intro'
import { beginTour, createTour, isTouring, resetTour, SPLASH_HOLD, tickTour } from './tour'

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
  renderer.toneMappingExposure = 1.06
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#f4f1ea')
  scene.fog = new THREE.Fog('#f4f1ea', 7, 16)
  scene.environment = env
  scene.environmentIntensity = 0.9

  const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 40)
  camera.position.copy(INTRO_HOME.position)

  RectAreaLightUniformsLib.init()

  const ambient = new THREE.AmbientLight('#f6efe4', 1.8)
  const hemi = new THREE.HemisphereLight('#fff8ef', '#e8dccb', 0)
  scene.add(ambient, hemi)

  const windowDiffuse = new THREE.RectAreaLight('#fff6ea', 0, 8, 5)
  windowDiffuse.position.set(-3.6, 2.6, 1.4)
  windowDiffuse.lookAt(0, 0.4, 0)
  scene.add(windowDiffuse)

  const skyDiffuse = new THREE.RectAreaLight('#fffaf3', 0, 10, 6)
  skyDiffuse.position.set(0.2, 5.2, 0.4)
  skyDiffuse.lookAt(0, 0.3, 0)
  scene.add(skyDiffuse)

  const direct = new THREE.DirectionalLight('#fff6ea', 1.08)
  direct.position.set(-3.2, 3.8, 2.4)
  direct.castShadow = true
  direct.shadow.mapSize.set(2048, 2048)
  direct.shadow.camera.near = 1
  direct.shadow.camera.far = 16
  direct.shadow.camera.left = -4
  direct.shadow.camera.right = 4
  direct.shadow.camera.top = 4
  direct.shadow.camera.bottom = -4
  direct.shadow.radius = 6
  direct.shadow.bias = -0.00015
  scene.add(direct)

  const fill = new THREE.DirectionalLight('#f3ebe0', 1.21)
  fill.position.set(2.8, 1.8, -1.4)
  scene.add(fill)

  const ground = createGround()
  scene.add(ground)

  const uniforms = createMeltUniforms()
  const anim = createMeltAnim()
  applyMeltAnim(uniforms, anim)
  const carrier = new THREE.Group()
  carrier.name = 'tour-carrier'
  scene.add(carrier)

  let subject: THREE.Object3D = createStandInBox(uniforms)
  carrier.add(subject)
  bindMeltBounds(subject, uniforms)
  const restCenter = uniforms.uCenter.value.clone()
  const restMin = uniforms.uBoundsMin.value.clone()
  const restMax = uniforms.uBoundsMax.value.clone()
  const captureRest = () => {
    restCenter.copy(uniforms.uCenter.value)
    restMin.copy(uniforms.uBoundsMin.value)
    restMax.copy(uniforms.uBoundsMax.value)
  }
  captureRest()

  let puddle = createPuddle(firstAlbedo(subject))
  carrier.add(puddle)

  const tour = createTour()

  const setSource = (text: string) => {
    if (source) source.textContent = text
  }
  setSource('Stand-in box — drop your scan to replace it')

  const replaceSubject = (next: THREE.Object3D, label: string) => {
    if (subject.parent) subject.parent.remove(subject)
    subject = next
    carrier.add(subject)
    bindMeltBounds(subject, uniforms)
    captureRest()
    const map = firstAlbedo(subject)
    if (puddle.parent) puddle.parent.remove(puddle)
    puddle = createPuddle(map)
    carrier.add(puddle)
    resetTour(tour)
    carrier.position.set(0, 0, 0)
    uniforms.uTourOffset.value.set(0, 0, 0)
    setSource(label)
  }

  const anisotropy = renderer.capabilities.getMaxAnisotropy()

  const bundled = await findBundledScan()
  if (bundled) {
    prepareLoadedScan(bundled.root, uniforms, anisotropy)
    const name = bundled.url.split('/').pop() || bundled.url
    replaceSubject(bundled.root, `Scan · ${name}`)
  }

  const controls = new OrbitControls(camera, canvas)
  controls.enablePan = false
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 1.2
  controls.maxDistance = 4.6
  controls.minPolarAngle = 0.72
  controls.maxPolarAngle = 1.42
  controls.autoRotate = false
  controls.autoRotateSpeed = 0
  controls.target.copy(INTRO_HOME.target)
  const home = {
    position: INTRO_HOME.position.clone(),
    target: INTRO_HOME.target.clone(),
  }

  const post = createPost(renderer, scene, camera)
  const intro = createIntro({
    camera,
    renderer,
    rig: { ambient, windowDiffuse, skyDiffuse, direct, fill },
    setDof: post.setDof,
  })
  const skipIntro = shouldSkipIntro()
  if (skipIntro) {
    intro.skip()
    document.body.classList.add('ready')
  } else {
    controls.enabled = false
    document.body.classList.add('filming')
  }

  const clock = new THREE.Clock()
  let melt = 0
  let meltTarget = 0
  let meltedAway = false
  let sequenceLock = !skipIntro
  let holding = false
  let downOnSubject = false
  let dragged = false
  let pointer = new THREE.Vector2()
  let down = new THREE.Vector2()
  let hintGone = false
  const puddleHome = new THREE.Vector3()

  const ao = { blendIntensity: post.gtao.blendIntensity }

  attachDebugMenu({
    uniforms,
    anim,
    onPlay: () => {
      intro.skip()
      document.body.classList.remove('filming')
      document.body.classList.add('ready')
      anim.scrubbing = false
      resetTour(tour)
      sequenceLock = false
      meltedAway = true
      meltTarget = SPLASH_HOLD
      controls.enabled = true
    },
    onReform: () => {
      intro.skip()
      document.body.classList.remove('filming')
      document.body.classList.add('ready')
      anim.scrubbing = false
      resetTour(tour)
      sequenceLock = false
      meltedAway = false
      meltTarget = 0
      controls.enabled = true
    },
  })

  const raycaster = new THREE.Raycaster()
  const hitsSubject = (clientX: number, clientY: number) => {
    pointer.x = (clientX / window.innerWidth) * 2 - 1
    pointer.y = -(clientY / window.innerHeight) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    if (raycaster.intersectObject(subject, true).length > 0) return true
    return puddle.visible && raycaster.intersectObject(puddle, true).length > 0
  }

  const hideHint = () => {
    if (hintGone) return
    hintGone = true
    hintWrap?.classList.add('is-hidden')
  }

  canvas.addEventListener('pointerdown', (event) => {
    down.set(event.clientX, event.clientY)
    dragged = false
    if (intro.shouldBlockInput() || sequenceLock || isTouring(tour)) {
      holding = false
      downOnSubject = false
      return
    }
    downOnSubject = hitsSubject(event.clientX, event.clientY)
    holding = downOnSubject && !meltedAway
    controls.autoRotate = false
    hideHint()
  })

  canvas.addEventListener('pointermove', (event) => {
    if (down.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > MOVE_PX) {
      dragged = true
      holding = false
    }
  })

  const startSplashTour = (scripted = false) => {
    if (isTouring(tour) || melt < SPLASH_HOLD * 0.72) return
    if (!scripted && (intro.shouldBlockInput() || sequenceLock)) return
    anim.scrubbing = false
    sequenceLock = true
    puddleHome.set(restCenter.x, FLOOR, restCenter.z)
    beginTour(tour, camera, puddleHome)
    controls.enabled = false
  }

  const endPointer = () => {
    if (intro.shouldBlockInput() || sequenceLock || isTouring(tour)) {
      holding = false
      downOnSubject = false
      return
    }
    if (!dragged && downOnSubject && !meltedAway) {
      anim.scrubbing = false
      meltedAway = true
      meltTarget = SPLASH_HOLD
    } else if (!dragged && meltedAway) {
      startSplashTour()
    }
    holding = false
    downOnSubject = false
  }
  canvas.addEventListener('pointerup', endPointer)
  canvas.addEventListener('pointercancel', () => {
    holding = false
    downOnSubject = false
  })
  canvas.addEventListener('pointerleave', () => {
    holding = false
  })

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && intro.active) {
      intro.skip()
      resetTour(tour)
      sequenceLock = false
      meltedAway = false
      melt = 0
      meltTarget = 0
      carrier.position.set(0, 0, 0)
      uniforms.uTourOffset.value.set(0, 0, 0)
      controls.target.copy(home.target)
      camera.position.copy(home.position)
      controls.enabled = true
      document.body.classList.remove('filming')
      document.body.classList.add('ready')
      return
    }
    if (event.code !== 'Space') return
    event.preventDefault()
    if (intro.shouldBlockInput() || sequenceLock || isTouring(tour)) return
    anim.scrubbing = false
    meltedAway = true
    meltTarget = SPLASH_HOLD
    hideHint()
  })
  window.addEventListener('keyup', (event) => {
    if (event.code !== 'Space' || intro.shouldBlockInput() || sequenceLock || isTouring(tour)) return
    meltTarget = meltedAway ? SPLASH_HOLD : 0
  })

  reset?.addEventListener('click', () => {
    intro.skip()
    camera.position.copy(home.position)
    controls.target.copy(home.target)
    anim.scrubbing = false
    resetTour(tour)
    sequenceLock = false
    carrier.position.set(0, 0, 0)
    uniforms.uTourOffset.value.set(0, 0, 0)
    uniforms.uCenter.value.copy(restCenter)
    uniforms.uBoundsMin.value.copy(restMin)
    uniforms.uBoundsMax.value.copy(restMax)
    controls.enabled = true
    melt = 0
    meltTarget = 0
    meltedAway = false
    document.body.classList.remove('filming')
    document.body.classList.add('ready')
  })

  const loadFile = async (file: File) => {
    const url = URL.createObjectURL(file)
    setSource(`Loading ${file.name}…`)
    try {
      const root = await loadScanFromUrl(url, file.name)
      prepareLoadedScan(root, uniforms, anisotropy)
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
    const rawDt = clock.getDelta()
    const dt = tour.playing ? Math.min(rawDt, 1 / 24) : rawDt
    uniforms.uTime.value = clock.elapsedTime
    if (holding && !intro.shouldBlockInput() && !sequenceLock && !isTouring(tour)) meltTarget = SPLASH_HOLD
    if (tour.playing && tickTour(tour, dt, camera) === 'done') {
      meltedAway = false
      meltTarget = 0
    }
    const boxSolid = !tour.playing && !meltedAway && meltTarget === 0 && melt < 0.008
    if (sequenceLock && boxSolid && !intro.active) {
      sequenceLock = false
      controls.enabled = true
    }

    if (anim.scrubbing) {
      melt = anim.progress
      meltTarget = anim.progress
      meltedAway = anim.progress > SPLASH_HOLD * 0.72
    } else if (!isTouring(tour)) {
      const rate = meltTarget > melt ? anim.meltIn : anim.meltOut
      melt = THREE.MathUtils.damp(melt, meltTarget, rate, dt)
      if (meltTarget === SPLASH_HOLD && melt > SPLASH_HOLD - 0.05) melt = SPLASH_HOLD
      if (meltTarget === 0 && melt < 0.008) melt = 0
      anim.progress = melt
    }
    applyMeltAnim(uniforms, anim)
    const shown = visualMelt(melt, anim.ease)
    uniforms.uMelt.value = shown
    uniforms.uTourOffset.value.copy(tour.offset)
    carrier.position.copy(tour.offset)
    uniforms.uCenter.value.copy(restCenter).add(tour.offset)
    uniforms.uBoundsMin.value.copy(restMin).add(tour.offset)
    uniforms.uBoundsMax.value.copy(restMax).add(tour.offset)
    setMeltLook(subject, shown, uniforms, anim)
    const solid = shown < 0.05 && !isTouring(tour)
    subject.visible = true
    if (!subject.parent) carrier.add(subject)
    direct.castShadow = solid
    ground.receiveShadow = solid
    post.gtao.enabled = solid
    post.setMeltBloom(0)
    post.setMeltOcclusion(shown, ao.blendIntensity)

    puddle.visible = false

    const splashReady = meltedAway && melt >= SPLASH_HOLD * 0.72 && !tour.playing
    const cue = intro.tick(dt, { splashReady, boxSolid })
    if (cue === 'melt') {
      anim.scrubbing = false
      meltedAway = true
      meltTarget = SPLASH_HOLD
      sequenceLock = true
    }
    if (cue === 'tour') startSplashTour(true)
    if (cue === 'live') {
      controls.target.copy(home.target)
      camera.position.copy(home.position)
      const yaw = new THREE.Vector3(0, 1, 0)
      camera.position.sub(home.target).applyAxisAngle(yaw, 0.014).add(home.target)
      camera.lookAt(home.target)
      controls.enabled = true
      sequenceLock = false
      document.body.classList.remove('filming')
      document.body.classList.add('ready')
      hintGone = false
      hintWrap?.classList.remove('is-hidden')
      if (hint) hint.textContent = 'Drag to explore'
    }

    canvas.dataset.phase = tour.playing ? tour.phase : meltedAway ? 'splash' : 'box'
    canvas.dataset.lock = intro.shouldBlockInput() || sequenceLock || isTouring(tour) ? '1' : '0'
    canvas.dataset.intro = intro.chapter
    canvas.dataset.ndc = `${tour.ndc.x.toFixed(2)},${tour.ndc.y.toFixed(2)}`

    if (hint && intro.chapter !== 'live') {
      hint.textContent = ''
    } else if (hint && !hintGone) {
      if (hint.textContent === 'Drag to explore') {
        // keep the handoff line until the first drag
      } else if (tour.phase === 'falling' || isTouring(tour) || sequenceLock) hint.textContent = ''
      else if (meltedAway && melt >= SPLASH_HOLD * 0.72) hint.textContent = 'Click the splash to send it around'
      else if (meltedAway) hint.textContent = ''
      else hint.textContent = melt > 0.12 ? 'Click to return' : 'Drag to turn · Click to unmake'
    }

    if (!intro.active) controls.update()
    post.composer.render()
    requestAnimationFrame(loop)
  }

  clock.getDelta()
  loop()
}
