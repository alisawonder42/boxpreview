import * as THREE from 'three'

/** Parked melt progress: splash is formed, fade has not eaten it. */
export const SPLASH_HOLD = 0.62

export const TOUR = {
  crawlSeconds: 7.4,
  hangSeconds: 0.18,
  gravity: 28,
  planeY: 0.04,
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
  curve: THREE.CatmullRomCurve3 | null
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
    curve: null,
  }
}

function unprojectOnViewPlane(
  ndc: THREE.Vector2,
  camera: THREE.Camera,
  home: THREE.Vector3,
  target: THREE.Vector3,
) {
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

/** Screen-frame path: around the view, ending at the top-center. */
export function viewportFramePath(camera: THREE.Camera, home: THREE.Vector3) {
  const frame: Array<[number, number]> = [
    [0, -0.78],
    [-0.55, -0.8],
    [-0.84, -0.62],
    [-0.88, 0.02],
    [-0.84, 0.58],
    [-0.5, 0.84],
    [-0.18, 0.9],
    [0, 0.92],
  ]
  const pts = frame.map(([x, y]) =>
    unprojectOnViewPlane(new THREE.Vector2(x, y), camera, home, new THREE.Vector3()),
  )
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.15)
}

export function resetTour(tour: TourState) {
  tour.playing = false
  tour.phase = 'idle'
  tour.distance = 0
  tour.hangT = 0
  tour.fallVel = 0
  tour.curve = null
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
  tour.curve = viewportFramePath(camera, home)
}

export function tickTour(tour: TourState, dt: number): 'crawling' | 'hanging' | 'falling' | 'done' {
  if (!tour.playing) return 'done'

  if (tour.phase === 'crawling' && tour.curve) {
    tour.distance = Math.min(1, tour.distance + dt / TOUR.crawlSeconds)
    const point = tour.curve.getPoint(tour.distance)
    const onto = THREE.MathUtils.smoothstep(tour.distance, 0, 0.12)
    tour.world.lerpVectors(tour.home, point, onto)
    if (tour.distance >= 1) {
      tour.world.copy(point)
      tour.phase = 'hanging'
      tour.hangT = 0
    }
    tour.offset.copy(tour.world).sub(tour.home)
    return tour.phase === 'hanging' ? 'hanging' : 'crawling'
  }

  if (tour.phase === 'hanging') {
    tour.hangT += dt
    tour.offset.copy(tour.world).sub(tour.home)
    if (tour.hangT >= TOUR.hangSeconds) {
      tour.phase = 'falling'
      tour.fallVel = 0
    }
    return tour.phase === 'falling' ? 'falling' : 'hanging'
  }

  if (tour.phase === 'falling') {
    tour.fallVel += TOUR.gravity * dt
    tour.world.y -= tour.fallVel * dt
    const pull = 1 - Math.exp(-10 * dt)
    tour.world.x += (tour.home.x - tour.world.x) * pull
    tour.world.z += (tour.home.z - tour.world.z) * pull
    if (tour.world.y <= tour.home.y) {
      tour.world.copy(tour.home)
      tour.offset.set(0, 0, 0)
      resetTour(tour)
      return 'done'
    }
    tour.offset.copy(tour.world).sub(tour.home)
    return 'falling'
  }

  resetTour(tour)
  return 'done'
}

export function isTouring(tour: TourState) {
  return tour.playing
}
