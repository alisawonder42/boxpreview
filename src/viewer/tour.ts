import * as THREE from 'three'

/** Parked melt progress: splash is formed, fade has not eaten it. */
export const SPLASH_HOLD = 0.62

export const TOUR = {
  crawlSeconds: 5.2,
  hangSeconds: 0.4,
  gravity: 12.5,
}

export type TourState = {
  playing: boolean
  phase: 'crawling' | 'hanging' | 'falling' | 'idle'
  distance: number
  hangT: number
  fallVel: number
  home: THREE.Vector3
  world: THREE.Vector3
  offset: THREE.Vector3
  homeNdc: THREE.Vector2
  ndc: THREE.Vector2
  curveNdc: THREE.CatmullRomCurve3 | null
}

export function createTour(): TourState {
  return {
    playing: false,
    phase: 'idle',
    distance: 0,
    hangT: 0,
    fallVel: 0,
    home: new THREE.Vector3(),
    world: new THREE.Vector3(),
    offset: new THREE.Vector3(),
    homeNdc: new THREE.Vector2(),
    ndc: new THREE.Vector2(),
    curveNdc: null,
  }
}

function toNdc(world: THREE.Vector3, camera: THREE.Camera, target: THREE.Vector2) {
  const clip = world.clone().project(camera)
  target.set(clip.x, clip.y)
  return target
}

function fromNdc(ndc: THREE.Vector2, camera: THREE.Camera, home: THREE.Vector3, target: THREE.Vector3) {
  const normal = new THREE.Vector3()
  camera.getWorldDirection(normal)
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, home)
  const caster = new THREE.Raycaster()
  caster.setFromCamera(ndc, camera)
  if (!caster.ray.intersectPlane(plane, target)) {
    caster.ray.at(camera.position.distanceTo(home), target)
  }
  return target
}

/** NDC path around the viewport frame, ending at top-center. */
function frameNdcPath() {
  const frame: Array<[number, number]> = [
    [0.0, -0.55],
    [-0.42, -0.62],
    [-0.68, -0.28],
    [-0.72, 0.12],
    [-0.62, 0.42],
    [-0.28, 0.55],
    [0.0, 0.56],
  ]
  const pts = frame.map(([x, y]) => new THREE.Vector3(x, y, 0))
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.12)
}

export function resetTour(tour: TourState) {
  tour.playing = false
  tour.phase = 'idle'
  tour.distance = 0
  tour.hangT = 0
  tour.fallVel = 0
  tour.curveNdc = null
  tour.offset.set(0, 0, 0)
}

export function beginTour(tour: TourState, camera: THREE.Camera, home: THREE.Vector3) {
  tour.playing = true
  tour.phase = 'crawling'
  tour.distance = 0
  tour.hangT = 0
  tour.fallVel = 0
  tour.home.copy(home)
  tour.world.copy(home)
  tour.offset.set(0, 0, 0)
  toNdc(home, camera, tour.homeNdc)
  tour.ndc.copy(tour.homeNdc)
  tour.curveNdc = frameNdcPath()
}

export function tickTour(tour: TourState, dt: number, camera: THREE.Camera): 'crawling' | 'hanging' | 'falling' | 'done' {
  if (!tour.playing) return 'done'

  const place = () => {
    fromNdc(tour.ndc, camera, tour.home, tour.world)
    tour.offset.copy(tour.world).sub(tour.home)
  }

  if (tour.phase === 'crawling' && tour.curveNdc) {
    tour.distance = Math.min(1, tour.distance + dt / TOUR.crawlSeconds)
    const point = tour.curveNdc.getPoint(tour.distance)
    const onto = THREE.MathUtils.smoothstep(tour.distance, 0, 0.1)
    tour.ndc.set(
      THREE.MathUtils.lerp(tour.homeNdc.x, point.x, onto),
      THREE.MathUtils.lerp(tour.homeNdc.y, point.y, onto),
    )
    place()
    if (tour.distance >= 0.98 || (Math.abs(tour.ndc.x) < 0.05 && tour.ndc.y >= 0.54)) {
      tour.ndc.set(0, 0.56)
      place()
      tour.phase = 'hanging'
      tour.hangT = 0
    }
    return tour.phase === 'hanging' ? 'hanging' : 'crawling'
  }

  if (tour.phase === 'hanging') {
    tour.ndc.set(0, 0.56)
    place()
    tour.hangT += dt
    if (tour.hangT >= TOUR.hangSeconds) {
      tour.phase = 'falling'
      tour.fallVel = 0
    }
    return tour.phase === 'falling' ? 'falling' : 'hanging'
  }

  if (tour.phase === 'falling') {
    tour.fallVel += TOUR.gravity * dt
    tour.ndc.y -= tour.fallVel * dt
    tour.ndc.x += (tour.homeNdc.x - tour.ndc.x) * (1 - Math.exp(-14 * dt))
    if (tour.ndc.y <= tour.homeNdc.y) {
      tour.ndc.copy(tour.homeNdc)
      tour.world.copy(tour.home)
      tour.offset.set(0, 0, 0)
      resetTour(tour)
      return 'done'
    }
    place()
    return 'falling'
  }

  resetTour(tour)
  return 'done'
}

export function isTouring(tour: TourState) {
  return tour.playing
}
