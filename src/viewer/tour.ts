import * as THREE from 'three'

/** Parked melt progress: splash is formed, fade has not eaten it. */
export const SPLASH_HOLD = 0.62

export const TOUR = {
  loopSeconds: 10.8,
  returnSeconds: 2.9,
  planeY: 0.04,
}

export type TourState = {
  playing: boolean
  returning: boolean
  distance: number
  startU: number
  returnT: number
  home: THREE.Vector3
  offset: THREE.Vector3
  from: THREE.Vector3
  curve: THREE.CatmullRomCurve3 | null
}

export function createTour(): TourState {
  return {
    playing: false,
    returning: false,
    distance: 0,
    startU: 0,
    returnT: 0,
    home: new THREE.Vector3(),
    offset: new THREE.Vector3(),
    from: new THREE.Vector3(),
    curve: null,
  }
}

function unprojectOnPlane(ndc: THREE.Vector2, camera: THREE.Camera, y: number, target: THREE.Vector3) {
  const caster = new THREE.Raycaster()
  caster.setFromCamera(ndc, camera)
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y)
  if (!caster.ray.intersectPlane(plane, target)) {
    caster.ray.at(6, target)
    target.y = y
  }
  return target
}

export function viewportPerimeter(camera: THREE.Camera, y = TOUR.planeY) {
  const forward = new THREE.Vector3(0, 0, -1)
  camera.getWorldDirection(forward)
  forward.y = 0
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1)
  forward.normalize()
  const right = new THREE.Vector3().set(forward.z, 0, -forward.x)
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0)
  right.normalize()

  const origin = new THREE.Vector3()
  unprojectOnPlane(new THREE.Vector2(0, -0.06), camera, y, origin)

  const pts: THREE.Vector3[] = []
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    pts.push(
      new THREE.Vector3(
        origin.x + right.x * Math.cos(a) * 0.92 + forward.x * Math.sin(a) * 0.58,
        y,
        origin.z + right.z * Math.cos(a) * 0.92 + forward.z * Math.sin(a) * 0.58,
      ),
    )
  }
  return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.12)
}

function nearestU(curve: THREE.CatmullRomCurve3, point: THREE.Vector3) {
  let best = 0
  let bestD = Infinity
  const sample = new THREE.Vector3()
  for (let i = 0; i <= 80; i++) {
    const u = i / 80
    curve.getPoint(u, sample)
    const d = sample.distanceToSquared(point)
    if (d < bestD) {
      bestD = d
      best = u
    }
  }
  return best
}

export function resetTour(tour: TourState) {
  tour.playing = false
  tour.returning = false
  tour.distance = 0
  tour.returnT = 0
  tour.curve = null
  tour.offset.set(0, 0, 0)
}

export function beginTour(tour: TourState, camera: THREE.Camera, home: THREE.Vector3) {
  tour.playing = true
  tour.returning = false
  tour.distance = 0
  tour.returnT = 0
  tour.home.copy(home)
  tour.home.y = TOUR.planeY
  tour.offset.set(0, 0, 0)
  tour.curve = viewportPerimeter(camera, TOUR.planeY)
  tour.startU = nearestU(tour.curve, tour.home)
}

function easeInOut(t: number) {
  const x = THREE.MathUtils.clamp(t, 0, 1)
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}

export function tickTour(tour: TourState, dt: number): 'touring' | 'returning' | 'done' {
  if (!tour.playing || !tour.curve) return 'done'

  if (tour.returning) {
    tour.returnT += dt / TOUR.returnSeconds
    const k = easeInOut(tour.returnT)
    tour.offset.copy(tour.from).multiplyScalar(1 - k)
    if (tour.returnT >= 1) {
      resetTour(tour)
      return 'done'
    }
    return 'returning'
  }

  tour.distance += dt / TOUR.loopSeconds
  if (tour.distance >= 1) {
    tour.returning = true
    tour.returnT = 0
    tour.from.copy(tour.offset)
    return 'returning'
  }

  const u = (tour.startU + tour.distance) % 1
  const point = tour.curve.getPoint(u)
  point.y += Math.sin(tour.distance * Math.PI * 2) * 0.035
  tour.offset.copy(point).sub(tour.home)
  const onto = THREE.MathUtils.smoothstep(tour.distance, 0, 0.1)
  tour.offset.multiplyScalar(onto)
  return 'touring'
}

export function isTouring(tour: TourState) {
  return tour.playing
}
