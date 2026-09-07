import * as THREE from 'three'
import { FLOOR } from './models'

type IntroRig = {
  ambient: THREE.AmbientLight
  direct: THREE.DirectionalLight
  fill: THREE.DirectionalLight
  windowDiffuse: THREE.RectAreaLight
  skyDiffuse: THREE.RectAreaLight
}

export type IntroChapter = 'film' | 'hold' | 'melt' | 'tour' | 'settle' | 'live'

export type IntroCue = 'none' | 'melt' | 'tour' | 'live'

type Key = {
  t: number
  pos: [number, number, number]
  target: [number, number, number]
  fov: number
  exposure: number
  ambient: number
  direct: number
  fill: number
  window: number
  sky: number
  aperture: number
  light: [number, number, number]
}

const LIVE_POS: [number, number, number] = [1.75, 1.08, 2.05]
const LIVE_TARGET: [number, number, number] = [0, FLOOR + 0.42, 0]
const LIVE_LIGHT: [number, number, number] = [-3.2, 3.8, 2.4]

/** Authored product-film poses. Times are seconds from first frame. */
const KEYS: Key[] = [
  {
    t: 0,
    pos: [3.62, 1.92, 4.48],
    target: [0.04, 0.22, 0.1],
    fov: 28,
    exposure: 0.56,
    ambient: 0.62,
    direct: 0.22,
    fill: 0.12,
    window: 0,
    sky: 0,
    aperture: 0,
    light: [-4.4, 2.15, 0.85],
  },
  {
    t: 2.5,
    pos: [2.72, 1.42, 3.22],
    target: [0.02, 0.32, 0.05],
    fov: 29,
    exposure: 0.78,
    ambient: 1.05,
    direct: 0.58,
    fill: 0.42,
    window: 2.4,
    sky: 0.8,
    aperture: 0,
    light: [-3.7, 3.05, 1.7],
  },
  {
    t: 4.0,
    pos: [2.18, 1.16, 2.52],
    target: [0, 0.38, 0.02],
    fov: 30,
    exposure: 0.98,
    ambient: 1.45,
    direct: 0.92,
    fill: 0.82,
    window: 3.6,
    sky: 1.4,
    aperture: 0.00004,
    light: [-3.35, 3.55, 2.15],
  },
  {
    t: 4.32,
    pos: [0.68, 0.54, 0.98],
    target: [0.03, 0.36, 0.2],
    fov: 25,
    exposure: 1.08,
    ambient: 1.55,
    direct: 1.12,
    fill: 0.7,
    window: 1.2,
    sky: 0.4,
    aperture: 0.00022,
    light: [-2.4, 3.1, 2.8],
  },
  {
    t: 5.85,
    pos: [0.92, 0.5, 0.74],
    target: [0.06, 0.34, 0.16],
    fov: 24.5,
    exposure: 1.1,
    ambient: 1.5,
    direct: 1.05,
    fill: 0.64,
    window: 0.8,
    sky: 0.3,
    aperture: 0.0002,
    light: [-2.2, 2.9, 2.9],
  },
  {
    t: 6.25,
    pos: [1.22, 0.7, 1.28],
    target: [0.04, 0.4, 0.02],
    fov: 27,
    exposure: 1.04,
    ambient: 1.6,
    direct: 1.0,
    fill: 0.88,
    window: 0.4,
    sky: 0.15,
    aperture: 0.00008,
    light: [-2.8, 3.3, 2.2],
  },
  {
    t: 7.35,
    pos: [1.58, 0.82, 0.62],
    target: [0.05, 0.4, -0.04],
    fov: 28,
    exposure: 1.05,
    ambient: 1.7,
    direct: 1.04,
    fill: 1.05,
    window: 0.15,
    sky: 0.05,
    aperture: 0.00003,
    light: [-3.0, 3.55, 2.0],
  },
  {
    t: 8.7,
    pos: LIVE_POS,
    target: LIVE_TARGET,
    fov: 32,
    exposure: 1.06,
    ambient: 1.8,
    direct: 1.08,
    fill: 1.21,
    window: 0,
    sky: 0,
    aperture: 0,
    light: LIVE_LIGHT,
  },
]

const FILM_END = KEYS[KEYS.length - 1].t
const HOLD = 0.45
const SETTLE = 1.15

function smoother(t: number) {
  const x = THREE.MathUtils.clamp(t, 0, 1)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

function lerpKey(a: Key, b: Key, u: number): Key {
  const cut = b.t - a.t < 0.4
  const k = cut ? smoother(smoother(u)) : smoother(u)
  const mix = (av: number, bv: number) => THREE.MathUtils.lerp(av, bv, k)
  const mix3 = (av: [number, number, number], bv: [number, number, number]): [number, number, number] => [
    mix(av[0], bv[0]),
    mix(av[1], bv[1]),
    mix(av[2], bv[2]),
  ]
  return {
    t: mix(a.t, b.t),
    pos: mix3(a.pos, b.pos),
    target: mix3(a.target, b.target),
    fov: mix(a.fov, b.fov),
    exposure: mix(a.exposure, b.exposure),
    ambient: mix(a.ambient, b.ambient),
    direct: mix(a.direct, b.direct),
    fill: mix(a.fill, b.fill),
    window: mix(a.window, b.window),
    sky: mix(a.sky, b.sky),
    aperture: mix(a.aperture, b.aperture),
    light: mix3(a.light, b.light),
  }
}

function sampleKeys(time: number): Key {
  if (time <= KEYS[0].t) return KEYS[0]
  const last = KEYS[KEYS.length - 1]
  if (time >= last.t) return last
  for (let i = 1; i < KEYS.length; i++) {
    if (time <= KEYS[i].t) {
      const a = KEYS[i - 1]
      const span = KEYS[i].t - a.t
      return lerpKey(a, KEYS[i], span <= 1e-5 ? 1 : (time - a.t) / span)
    }
  }
  return last
}

export type Intro = {
  chapter: IntroChapter
  active: boolean
  tick: (dt: number, signals: { splashReady: boolean; boxSolid: boolean }) => IntroCue
  apply: () => void
  skip: () => void
  shouldBlockInput: () => boolean
}

export function shouldSkipIntro() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('intro') === '1' || params.get('intro') === 'true') {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }
  return true
}

export function createIntro(options: {
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  rig?: Partial<IntroRig>
  setDof?: (focus: number, aperture: number) => void
}): Intro {
  const { camera, renderer, rig = {}, setDof } = options
  const look = new THREE.Vector3()
  let chapter: IntroChapter = 'film'
  let t = 0
  let origin = 0
  let settleT = 0
  let cuedMelt = false
  let cuedTour = false
  let cuedLive = false
  let fromPos = new THREE.Vector3()
  let fromTarget = new THREE.Vector3()
  let fromFov = 32

  const live = sampleKeys(FILM_END)

  const pose = (key: Key) => {
    camera.position.set(key.pos[0], key.pos[1], key.pos[2])
    look.set(key.target[0], key.target[1], key.target[2])
    camera.lookAt(look)
    if (Math.abs(camera.fov - key.fov) > 0.01) {
      camera.fov = key.fov
      camera.updateProjectionMatrix()
    }
    renderer.toneMappingExposure = key.exposure
    if (rig.ambient) rig.ambient.intensity = key.ambient
    if (rig.direct) {
      rig.direct.intensity = key.direct
      rig.direct.position.set(key.light[0], key.light[1], key.light[2])
    }
    if (rig.fill) rig.fill.intensity = key.fill
    if (rig.windowDiffuse) rig.windowDiffuse.intensity = key.window
    if (rig.skyDiffuse) rig.skyDiffuse.intensity = key.sky
    setDof?.(camera.position.distanceTo(look), key.aperture)
  }

  const goLive = () => {
    chapter = 'live'
    t = FILM_END
    pose(live)
    setDof?.(camera.position.distanceTo(look.set(LIVE_TARGET[0], LIVE_TARGET[1], LIVE_TARGET[2])), 0)
  }

  const apply = () => {
    if (chapter === 'live') {
      pose(live)
      return
    }
    if (chapter === 'settle') {
      const u = smoother(settleT / SETTLE)
      camera.position.lerpVectors(fromPos, new THREE.Vector3().fromArray(LIVE_POS), u)
      look.lerpVectors(fromTarget, new THREE.Vector3().fromArray(LIVE_TARGET), u)
      camera.lookAt(look)
      camera.fov = THREE.MathUtils.lerp(fromFov, 32, u)
      camera.updateProjectionMatrix()
      renderer.toneMappingExposure = THREE.MathUtils.lerp(renderer.toneMappingExposure, live.exposure, 0.12)
      if (rig.ambient) rig.ambient.intensity = THREE.MathUtils.lerp(rig.ambient.intensity, live.ambient, 0.12)
      if (rig.direct) {
        rig.direct.intensity = THREE.MathUtils.lerp(rig.direct.intensity, live.direct, 0.12)
        rig.direct.position.lerp(new THREE.Vector3().fromArray(LIVE_LIGHT), 0.12)
      }
      if (rig.fill) rig.fill.intensity = THREE.MathUtils.lerp(rig.fill.intensity, live.fill, 0.12)
      if (rig.windowDiffuse) {
        rig.windowDiffuse.intensity = THREE.MathUtils.lerp(rig.windowDiffuse.intensity, 0, 0.16)
      }
      if (rig.skyDiffuse) rig.skyDiffuse.intensity = THREE.MathUtils.lerp(rig.skyDiffuse.intensity, 0, 0.16)
      setDof?.(camera.position.distanceTo(look), 0)
      return
    }
    const time = chapter === 'film' ? t : FILM_END
    pose(sampleKeys(time))
  }

  apply()

  return {
    get chapter() {
      return chapter
    },
    get active() {
      return chapter !== 'live'
    },
    shouldBlockInput() {
      return chapter !== 'live'
    },
    apply,
    skip() {
      goLive()
    },
    tick(dt, signals) {
      if (chapter === 'live') return 'none'

      if (chapter === 'film') {
        if (!origin) origin = performance.now()
        t = Math.min(FILM_END, (performance.now() - origin) / 1000)
        apply()
        if (t >= FILM_END) chapter = 'hold'
        return 'none'
      }

      if (chapter === 'hold') {
        if (!origin) origin = performance.now()
        t = (performance.now() - origin) / 1000
        apply()
        if (t >= FILM_END + HOLD && !cuedMelt) {
          chapter = 'melt'
          cuedMelt = true
          apply()
          return 'melt'
        }
        return 'none'
      }

      if (chapter === 'melt') {
        apply()
        if (signals.splashReady && !cuedTour) {
          chapter = 'tour'
          cuedTour = true
          return 'tour'
        }
        return 'none'
      }

      if (chapter === 'tour') {
        apply()
        if (signals.boxSolid) {
          chapter = 'settle'
          settleT = 0
          fromPos.copy(camera.position)
          fromTarget.fromArray(LIVE_TARGET)
          fromFov = camera.fov
          return 'none'
        }
        return 'none'
      }

      if (chapter === 'settle') {
        settleT = Math.min(SETTLE, settleT + dt)
        apply()
        if (settleT >= SETTLE && !cuedLive) {
          goLive()
          cuedLive = true
          return 'live'
        }
      }

      return 'none'
    },
  }
}

export const INTRO_HOME = {
  position: new THREE.Vector3(...LIVE_POS),
  target: new THREE.Vector3(...LIVE_TARGET),
}
